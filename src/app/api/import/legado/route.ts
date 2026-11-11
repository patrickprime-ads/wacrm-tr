import { NextResponse } from "next/server";

import { ForbiddenError, UnauthorizedError, getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canEditSettings } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/flows/admin-client";

/**
 * Importação do CRM antigo (planilha "Leads" das unidades) para o Kanban (Prime, 11/11/2026).
 *
 * POST /api/import/legado  { leads: LeadLegado[] }  (no máximo 25 por chamada; a tela manda em lotes)
 * Só admin/dono da conta. Não duplica: cada linha tem uma chave (telefone + data de entrada) e o
 * contato é achado pelo telefone. Status da planilha vira a coluna do Kanban; a vendedora vira
 * o responsável (quando tem login) e fica gravada pelo nome em seller_name.
 */

type LeadLegado = {
  chave: string; entrada: string; fechamento: string | null; nome: string; telefone: string;
  origem: string; vendedora: string; status: "sem_retorno" | "negociacao" | "fechado" | "perdido" | "outro";
  valor: number; valor_up: number; produtos: string[]; parcelas: number; valor_mensal: number;
  motivo_perda: string; tempo_resposta: string; observacao: string;
  historico: { quando: string; texto: string }[]; arquivado: boolean;
};

const ETAPAS: { chave: LeadLegado["status"]; nome: string; cor: string; achar: RegExp }[] = [
  { chave: "outro", nome: "Novo", cor: "#a855f7", achar: /^novo/i },
  { chave: "sem_retorno", nome: "Sem retorno", cor: "#64748b", achar: /sem retorno/i },
  { chave: "negociacao", nome: "Em negociação", cor: "#3b82f6", achar: /negocia/i },
  { chave: "fechado", nome: "Fechado", cor: "#22c55e", achar: /fechad|ganh|vendid/i },
  { chave: "perdido", nome: "Perdido", cor: "#ef4444", achar: /perdid/i },
];
const MESES_CONTRATO = [1, 2, 3, 6, 12];
// Nome na planilha → primeiro nome do login (ex.: "Anne" na planilha é a Anna no CRM).
const APELIDOS: Record<string, string> = { anne: "anna" };
const primeiro = (s: string) => s.trim().split(/\s+/)[0]?.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() || "";
const txt = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const dataValida = (v: unknown) => { const d = new Date(String(v ?? "")); return isNaN(d.getTime()) ? null : d.toISOString(); };

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    if (!canEditSettings(ctx.role)) return NextResponse.json({ ok: false, error: "Só o dono ou um admin pode importar." }, { status: 403 });
    const body = (await request.json().catch(() => null)) as { leads?: LeadLegado[] } | null;
    const leads = (body?.leads ?? []).slice(0, 25).filter((l) => /^\d{10,15}$/.test(String(l?.telefone)) && txt(l?.chave));
    if (!leads.length) return NextResponse.json({ ok: false, error: "Nenhum lead válido no lote." }, { status: 400 });
    const db = supabaseAdmin();
    const conta = ctx.accountId;

    // 1. Funil e etapas (cria as que faltarem, no fim).
    let { data: funil } = await db.from("pipelines").select("id").eq("account_id", conta).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!funil) {
      const criado = await db.from("pipelines").insert({ account_id: conta, user_id: ctx.userId, name: "Comercial" }).select("id").single();
      if (criado.error) throw criado.error;
      funil = criado.data;
    }
    const funilId = funil!.id as string;
    const { data: etapasDb } = await db.from("pipeline_stages").select("id,name,position").eq("pipeline_id", funilId).order("position");
    const etapas = [...(etapasDb ?? [])] as { id: string; name: string; position: number }[];
    const etapaDe = new Map<string, string>();
    for (const e of ETAPAS) {
      let achada = etapas.find((x) => e.achar.test(x.name));
      if (!achada) {
        const pos = Math.max(-1, ...etapas.map((x) => x.position)) + 1;
        const nova = await db.from("pipeline_stages").insert({ pipeline_id: funilId, name: e.nome, color: e.cor, position: pos }).select("id,name,position").single();
        if (nova.error) throw nova.error;
        achada = nova.data as { id: string; name: string; position: number };
        etapas.push(achada);
      }
      etapaDe.set(e.chave, achada.id);
    }

    // 2. Vendedoras com login (pelo primeiro nome).
    const { data: perfis } = await db.from("profiles").select("id,full_name").eq("account_id", conta);
    const perfilDe = new Map<string, string>();
    for (const p of perfis ?? []) if (p.full_name) perfilDe.set(primeiro(String(p.full_name)), String(p.id));
    const responsavel = (nome: string) => { const k = primeiro(nome); return perfilDe.get(APELIDOS[k] || k) ?? null; };

    // 3. Já importados (pela chave): não repete.
    const chaves = leads.map((l) => txt(l.chave, 80));
    const { data: jaTem, error: erroChave } = await db.from("deals").select("legacy_key").eq("account_id", conta).in("legacy_key", chaves);
    if (erroChave) return NextResponse.json({ ok: false, error: "Rode a migração 053_legado_vendas.sql no banco do CRM antes de importar." }, { status: 409 });
    const importadas = new Set((jaTem ?? []).map((d) => String(d.legacy_key)));
    const novos = leads.filter((l) => !importadas.has(txt(l.chave, 80)));
    if (!novos.length) return NextResponse.json({ ok: true, criados: 0, pulados: leads.length });

    // 4. Contatos: acha pelo telefone, cria os que faltam.
    const fones = [...new Set(novos.map((l) => l.telefone))];
    const { data: contatos } = await db.from("contacts").select("id,phone_normalized,name").eq("account_id", conta).in("phone_normalized", fones);
    const contatoDe = new Map((contatos ?? []).map((c) => [String(c.phone_normalized), String(c.id)]));
    const faltam = fones.filter((f) => !contatoDe.has(f));
    if (faltam.length) {
      const linhas = faltam.map((f) => {
        const l = novos.find((x) => x.telefone === f)!;
        const nome = /^sem nome$/i.test(l.nome.trim()) ? "" : txt(l.nome, 120);
        return { account_id: conta, user_id: ctx.userId, phone: f, name: nome || f, created_at: dataValida(l.entrada) ?? new Date().toISOString(),
          lead_source: /meta/i.test(l.origem) ? "meta_ads" : /indica/i.test(l.origem) ? "indicacao" : "other", source_detail: `Planilha antiga · ${l.origem || "sem origem"}` };
      });
      let criados = await db.from("contacts").insert(linhas).select("id,phone_normalized");
      // Bancos sem as colunas de origem: cria só com o básico.
      if (criados.error) criados = await db.from("contacts").insert(linhas.map((l) => ({ account_id: l.account_id, user_id: l.user_id, phone: l.phone, name: l.name, created_at: l.created_at }))).select("id,phone_normalized");
      if (criados.error) throw criados.error;
      for (const c of criados.data ?? []) contatoDe.set(String(c.phone_normalized), String(c.id));
    }

    // 5. Cards.
    const cards = novos.map((l) => {
      const status = l.status === "fechado" ? "won" : l.status === "perdido" ? "lost" : "open";
      const meses = MESES_CONTRATO.includes(Number(l.parcelas)) ? Number(l.parcelas) : 1;
      const nome = /^sem nome$/i.test(l.nome.trim()) ? "" : txt(l.nome, 120);
      const notas = [l.observacao && `Observação: ${txt(l.observacao, 1500)}`, l.tempo_resposta && `Tempo de resposta: ${txt(l.tempo_resposta, 40)}`,
        l.valor_up ? `Valor UP: R$ ${Number(l.valor_up).toFixed(2).replace(".", ",")}` : "", `Importado da planilha antiga (vendedora: ${l.vendedora || "—"})`].filter(Boolean).join("\n");
      const fechouEm = l.status === "fechado" || l.status === "perdido" ? dataValida(l.fechamento ? `${l.fechamento}T18:00:00-03:00` : null) ?? dataValida(l.historico?.at(-1)?.quando) : null;
      return {
        account_id: conta, user_id: ctx.userId, pipeline_id: funilId, stage_id: etapaDe.get(l.status) ?? etapaDe.get("outro")!,
        contact_id: contatoDe.get(l.telefone) ?? null, title: nome || l.telefone, value: Number(l.valor) || 0,
        installment_value: Number(l.valor_mensal) || 0, contract_months: meses, selected_products: (l.produtos ?? []).map((p) => txt(p, 80)).filter(Boolean),
        currency: "BRL", notes: notas, status, assigned_to: responsavel(l.vendedora), seller_name: txt(l.vendedora, 60) || null,
        lost_reason: txt(l.motivo_perda, 300) || null, closed_at: fechouEm, archived: !!l.arquivado, legacy_key: txt(l.chave, 80),
        created_at: dataValida(l.entrada) ?? new Date().toISOString(), updated_at: fechouEm ?? dataValida(l.entrada) ?? new Date().toISOString(),
      };
    });
    const { data: criadosCards, error: erroCards } = await db.from("deals").insert(cards).select("id,legacy_key");
    if (erroCards) throw erroCards;

    // 6. Histórico de cada card (o que estava na coluna "Histórico" da planilha).
    const idDe = new Map((criadosCards ?? []).map((d) => [String(d.legacy_key), String(d.id)]));
    const atividades = novos.flatMap((l) => (l.historico ?? []).slice(0, 30).map((h) => ({
      account_id: conta, deal_id: idDe.get(txt(l.chave, 80))!, actor_name: l.vendedora || "Planilha antiga", event_type: "legacy_history",
      description: txt(h.texto, 400), metadata: { importado: true }, created_at: dataValida(h.quando) ?? new Date().toISOString(),
    }))).filter((a) => a.deal_id);
    if (atividades.length) {
      const hist = await db.from("deal_activities").insert(atividades);
      if (hist.error) console.warn("[import/legado] histórico não gravado:", hist.error.message);
    }
    return NextResponse.json({ ok: true, criados: cards.length, pulados: leads.length - novos.length });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return toErrorResponse(error);
    console.error("[import/legado]", error);
    const msg = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
    return NextResponse.json({ ok: false, error: `Falha na importação${msg ? `: ${msg.slice(0, 200)}` : ""}` }, { status: 500 });
  }
}
