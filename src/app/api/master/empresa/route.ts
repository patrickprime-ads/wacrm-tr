import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { DEFAULT_AGENT_FEATURES, getPlanFeatures } from "@/lib/features";

/**
 * Painel Master → Gerenciar empresa (Prime, 11/11/2026). Só o Admin Master.
 *  GET    ?account_id=                          → dados da empresa, logins e planos disponíveis
 *  PATCH  { account_id, name?, plan? }          → renomeia e/ou troca o plano (aplica os menus do plano)
 *  POST   { user_id, destino, papel }           → move um login para outra empresa
 *  DELETE { user_id } | { account_id }          → apaga um login, ou a empresa inteira com os logins dela
 */
async function exigirMaster() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: eu } = await supabase.from("profiles").select("is_master_admin").eq("user_id", user.id).maybeSingle();
  if (!eu?.is_master_admin) return { erro: NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 }) };
  return { user };
}

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const accountId = new URL(request.url).searchParams.get("account_id") || "";
  const db = supabaseAdmin();
  const [conta, usuarios, plano, planos] = await Promise.all([
    db.from("accounts").select("id, name, owner_user_id").eq("id", accountId).maybeSingle(),
    db.from("profiles").select("user_id, full_name, email, account_role, is_master_admin").eq("account_id", accountId).order("account_role"),
    db.from("account_features").select("plan").eq("account_id", accountId).maybeSingle(),
    db.from("crm_plans").select("key, name").order("created_at"),
  ]);
  if (!conta.data) return erro("Empresa não encontrada", 404);
  const lista = planos.data?.length ? planos.data : ["free", "pro", "business", "enterprise"].map((key) => ({ key, name: key }));
  return NextResponse.json({ ok: true, conta: { ...conta.data, plan: plano.data?.plan ?? "free" }, usuarios: usuarios.data ?? [], planos: lista });
}

export async function PATCH(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const b = (await request.json().catch(() => null)) as { account_id?: string; name?: string; plan?: string } | null;
  const accountId = String(b?.account_id || "");
  const db = supabaseAdmin();
  const { data: conta } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!conta) return erro("Empresa não encontrada", 404);

  const nome = String(b?.name ?? "").trim().slice(0, 120);
  if (nome) {
    const { error } = await db.from("accounts").update({ name: nome }).eq("id", accountId);
    if (error) return erro(`Não consegui renomear: ${error.message}`, 500);
  }

  const plano = String(b?.plan ?? "").trim();
  if (plano) {
    const { data: p } = await db.from("crm_plans").select("key, enabled_features, agent_enabled_features").eq("key", plano).maybeSingle();
    if (!p && !["free", "pro", "business", "enterprise"].includes(plano)) return erro("Plano não encontrado");
    const menus = (p?.enabled_features as string[] | null)?.length ? p!.enabled_features as string[] : getPlanFeatures(plano);
    const vendedores = ((p?.agent_enabled_features as string[] | null)?.length ? p!.agent_enabled_features as string[] : DEFAULT_AGENT_FEATURES).filter((f) => menus.includes(f));
    const { error } = await db.from("account_features").upsert({ account_id: accountId, plan: plano, enabled_features: menus, agent_enabled_features: vendedores, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error) return erro(`Não consegui trocar o plano: ${error.message}`, 500);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const b = (await request.json().catch(() => null)) as { user_id?: string; destino?: string; papel?: string } | null;
  const userId = String(b?.user_id || "");
  const destino = String(b?.destino || "");
  const papel = ["agent", "admin", "viewer"].includes(String(b?.papel)) ? String(b?.papel) : "agent";
  const db = supabaseAdmin();

  const { data: alvo } = await db.from("profiles").select("user_id, account_id, account_role, is_master_admin").eq("user_id", userId).maybeSingle();
  if (!alvo) return erro("Login não encontrado", 404);
  if (alvo.is_master_admin) return erro("Não dá para mover o Admin Master");
  if (alvo.account_id === destino) return erro("Esse login já está nessa empresa");
  const { data: dest } = await db.from("accounts").select("id, name").eq("id", destino).maybeSingle();
  if (!dest) return erro("Empresa de destino não encontrada", 404);

  // Se for dona da empresa atual, só dá para mover se ela estiver sozinha lá: a empresa vazia é apagada depois.
  const origem = alvo.account_id as string;
  let apagarOrigem = false;
  if (alvo.account_role === "owner") {
    const { count } = await db.from("profiles").select("user_id", { count: "exact", head: true }).eq("account_id", origem);
    if ((count ?? 0) > 1) return erro("Esse login é dono de uma empresa com outras pessoas. Passe a empresa para outro dono antes de mover.");
    apagarOrigem = true;
  }

  const { error } = await db.from("profiles").update({ account_id: destino, account_role: papel }).eq("user_id", userId);
  if (error) return erro(`Não consegui mover: ${error.message}`, 500);
  if (apagarOrigem) {
    const { error: e2 } = await db.from("accounts").delete().eq("id", origem);
    if (e2) return NextResponse.json({ ok: true, aviso: `Movido, mas a empresa antiga não foi apagada: ${e2.message}` });
  }
  return NextResponse.json({ ok: true, destino: dest.name, empresaAntigaApagada: apagarOrigem });
}

export async function DELETE(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const b = (await request.json().catch(() => null)) as { user_id?: string; account_id?: string } | null;
  const db = supabaseAdmin();

  // Apagar um login só.
  if (b?.user_id) {
    const { data: alvo } = await db.from("profiles").select("user_id, account_role, is_master_admin").eq("user_id", b.user_id).maybeSingle();
    if (!alvo) return erro("Login não encontrado", 404);
    if (alvo.is_master_admin || alvo.user_id === m.user!.id) return erro("Não dá para apagar o Admin Master");
    if (alvo.account_role === "owner") return erro("Esse login é o dono da empresa. Para tirar, apague a empresa inteira ou mova o login para outra empresa.");
    const { error } = await db.auth.admin.deleteUser(alvo.user_id);
    if (error) return erro(`Não consegui apagar o login: ${error.message}`, 500);
    return NextResponse.json({ ok: true });
  }

  // Apagar a empresa inteira (leads, negócios, conversas e logins dela).
  const accountId = String(b?.account_id || "");
  const { data: conta } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!conta) return erro("Empresa não encontrada", 404);
  const { data: membros } = await db.from("profiles").select("user_id, is_master_admin").eq("account_id", accountId);
  if ((membros ?? []).some((p) => p.is_master_admin || p.user_id === m.user!.id)) return erro("Essa é a empresa do Admin Master: não pode ser apagada.");

  const { error } = await db.from("accounts").delete().eq("id", accountId);
  if (error) return erro(`Não consegui apagar a empresa: ${error.message}`, 500);
  const falhas: string[] = [];
  for (const p of membros ?? []) {
    const { error: e } = await db.auth.admin.deleteUser(p.user_id);
    if (e) falhas.push(e.message);
  }
  return NextResponse.json({ ok: true, aviso: falhas.length ? `Empresa apagada; ${falhas.length} login(s) não saíram: ${falhas[0]}` : "" });
}
