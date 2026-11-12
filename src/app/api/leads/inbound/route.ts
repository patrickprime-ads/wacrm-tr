import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/flows/admin-client";
import { bearerToken, hashInboundToken } from "@/lib/inbound/token";

/**
 * Entrada de leads vindos do painel de rastreio (Prime, 05/11/2026).
 *
 *   GET  /api/leads/inbound   Authorization: Bearer <token>  → testa o token
 *   POST /api/leads/inbound   Authorization: Bearer <token>  → cria/atualiza o lead
 *
 * O POST acha o contato pelo telefone (nunca duplica), grava a origem/campanha/anúncio
 * e abre um card na primeira etapa do primeiro funil da conta. Se o lead já tem um card
 * aberto, só registra no histórico que ele voltou a chamar.
 */

type InboundLead = {
  external_id?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  channel?: unknown;
  campaign?: unknown;
  ad_id?: unknown;
  ad_headline?: unknown;
  ad_url?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  utm_term?: unknown;
  click_id?: unknown;
  landing_page?: unknown;
  received_at?: unknown;
};

const text = (value: unknown, max = 300) => {
  const out = String(value ?? "").trim().slice(0, max);
  return out || null;
};

const DEFAULT_STAGES = [
  { name: "Novo", color: "#a855f7" },
  { name: "Em negociação", color: "#3b82f6" },
  { name: "Sem retorno", color: "#64748b" },
];

function leadSource(channel: string | null, utmSource: string | null): string {
  const value = `${channel || ""} ${utmSource || ""}`.toLowerCase();
  if (/meta|facebook|instagram|\bfb\b|\big\b/.test(value)) return "meta_ads";
  if (/google/.test(value)) return "google_ads";
  if (/whatsapp/.test(value)) return "whatsapp";
  return "other";
}

async function accountFromToken(request: Request) {
  const token = bearerToken(request);
  if (token.length < 20) return null;
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select("id, name, default_currency")
    .eq("inbound_token_hash", hashInboundToken(token))
    .maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const account = await accountFromToken(request);
  if (!account) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
  return NextResponse.json({ ok: true, account: account.name });
}

async function firstStage(accountId: string, ownerId: string) {
  const db = supabaseAdmin();
  const { data: pipeline } = await db
    .from("pipelines")
    .select("id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let pipelineId = pipeline?.id as string | undefined;
  if (!pipelineId) {
    const created = await db
      .from("pipelines")
      .insert({ account_id: accountId, user_id: ownerId, name: "Comercial" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    pipelineId = created.data.id as string;
    const stages = await db.from("pipeline_stages").insert(
      DEFAULT_STAGES.map((stage, position) => ({ ...stage, position, pipeline_id: pipelineId })),
    );
    if (stages.error) throw stages.error;
  }

  const { data: stage } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) throw new Error("Funil sem etapas");
  return { pipelineId, stageId: stage.id as string };
}

export async function POST(request: Request) {
  try {
    const account = await accountFromToken(request);
    if (!account) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as InboundLead | null;
    const phone = String(body?.phone ?? "").replace(/\D/g, "");
    if (!body || phone.length < 10 || phone.length > 15) {
      return NextResponse.json({ ok: false, error: "Telefone inválido" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: owner } = await db
      .from("profiles")
      .select("user_id")
      .eq("account_id", account.id)
      .in("account_role", ["owner", "admin"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!owner?.user_id) {
      return NextResponse.json({ ok: false, error: "Conta sem proprietário" }, { status: 409 });
    }

    const name = text(body.name, 120);
    const channel = text(body.channel, 80);
    const campaign = text(body.campaign ?? body.utm_campaign, 200);
    const adHeadline = text(body.ad_headline, 200);
    const utmSource = text(body.utm_source, 120);
    const receivedAt = (() => {
      const date = new Date(String(body.received_at ?? ""));
      return Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60_000
        ? new Date().toISOString()
        : date.toISOString();
    })();
    const source = leadSource(channel, utmSource);
    const sourceDetail = [channel, campaign, adHeadline].filter(Boolean).join(" · ") || "Rastreio";
    // Bancos mais antigos não têm contacts.source_url: o link do anúncio fica no histórico.
    const adUrl = text(body.ad_url ?? body.landing_page, 500);

    const attribution = {
      lead_source: source,
      source_detail: sourceDetail,
      utm_source: utmSource ?? (source === "meta_ads" ? "meta" : null),
      utm_medium: text(body.utm_medium, 120) ?? (source === "meta_ads" ? "paid_social" : null),
      utm_campaign: campaign,
      utm_content: text(body.utm_content, 200) ?? adHeadline,
      utm_term: text(body.utm_term, 200),
      click_id: text(body.click_id, 300),
      ad_id: text(body.ad_id, 60),
      source_url: text(body.ad_url, 500),
      external_lead_id: text(body.external_id, 80),
    };

    // 1. Contato: acha pelo telefone; se não existe, cria com a data real de chegada.
    const { data: existing } = await db
      .from("contacts")
      .select("id, name, lead_source, source_detail, utm_campaign, click_id")
      .eq("account_id", account.id)
      .eq("phone_normalized", phone)
      .maybeSingle();

    let contactId: string;
    let isNewContact = false;
    if (existing) {
      contactId = existing.id as string;
      const update: Record<string, unknown> = {};
      const savedName = String(existing.name || "").replace(/\D/g, "") === phone ? "" : String(existing.name || "").trim();
      if (name && !savedName) update.name = name;
      // Primeira origem vale: só completa o que estiver vazio ou genérico.
      const genericSource = !existing.lead_source || ["organico", "whatsapp", "other"].includes(String(existing.lead_source));
      if ((genericSource || existing.lead_source === source) && source !== "other") Object.assign(update, attribution);
      else {
        if (!existing.utm_campaign && attribution.utm_campaign) update.utm_campaign = attribution.utm_campaign;
        if (!existing.click_id && attribution.click_id) update.click_id = attribution.click_id;
      }
      if (Object.keys(update).length) {
        await db.from("contacts").update({ ...update, updated_at: new Date().toISOString() }).eq("id", contactId);
      }
    } else {
      const created = await db
        .from("contacts")
        .insert({
          account_id: account.id,
          user_id: owner.user_id,
          name: name || phone,
          phone,
          email: text(body.email, 200),
          lead_temperature: "frio",
          created_at: receivedAt,
          ...attribution,
        })
        .select("id")
        .single();
      if (created.error) {
        // Corrida com outra entrada do mesmo telefone: usa o contato que ganhou.
        const { data: raced } = await db
          .from("contacts")
          .select("id")
          .eq("account_id", account.id)
          .eq("phone_normalized", phone)
          .maybeSingle();
        if (!raced) {
          console.error("[leads/inbound] contato:", created.error.message);
          throw created.error;
        }
        contactId = raced.id as string;
      } else {
        contactId = created.data.id as string;
        isNewContact = true;
      }
    }

    // Prime: miniatura do anúncio (coluna da atualização 055; sem ela, só não guarda).
    const adImage = text(body.ad_image, 1000);
    if (adImage && /^https:\/\//.test(adImage)) {
      await db.from("contacts").update({ ad_image_url: adImage }).eq("id", contactId).then(() => null, () => null);
    }

    // 2. Card no Kanban: um card aberto por lead.
    const { data: openDeal } = await db
      .from("deals")
      .select("id")
      .eq("account_id", account.id)
      .eq("contact_id", contactId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let dealId = openDeal?.id as string | undefined;
    let createdDeal = false;
    if (!dealId) {
      const { pipelineId, stageId } = await firstStage(account.id, owner.user_id);
      const created = await db
        .from("deals")
        .insert({
          account_id: account.id,
          user_id: owner.user_id,
          pipeline_id: pipelineId,
          stage_id: stageId,
          contact_id: contactId,
          title: name || phone,
          value: 0,
          currency: account.default_currency || "BRL",
          status: "open",
          created_at: receivedAt,
        })
        .select("id")
        .single();
      if (created.error) {
        console.error("[leads/inbound] card:", created.error.message);
        throw created.error;
      }
      dealId = created.data.id as string;
      createdDeal = true;
    }

    // 3. Histórico do card: quando e de onde o lead chegou.
    const when = new Date(receivedAt).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Histórico do card: em bancos sem a tabela deal_activities (migração 038), segue sem ele.
    const history = await db.from("deal_activities").insert({
      account_id: account.id,
      deal_id: dealId,
      actor_name: "Rastreio",
      event_type: createdDeal ? "lead_received" : "lead_returned",
      description: `${createdDeal ? "Lead recebido" : "Lead voltou a chamar"} em ${when} · ${sourceDetail}`,
      metadata: { source, campaign, ad_id: attribution.ad_id, ad_headline: adHeadline, ad_url: adUrl, external_id: attribution.external_lead_id },
    });
    if (history.error) console.warn("[leads/inbound] histórico não gravado:", history.error.message);

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      deal_id: dealId,
      new_contact: isNewContact,
      new_deal: createdDeal,
    });
  } catch (error) {
    console.error("[leads/inbound]", error);
    const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
    return NextResponse.json({ ok: false, error: `Falha ao registrar o lead${message ? `: ${message.slice(0, 160)}` : ""}` }, { status: 500 });
  }
}
