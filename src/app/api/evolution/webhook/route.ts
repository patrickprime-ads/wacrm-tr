import { NextResponse } from "next/server";
import { decrypt } from "@/lib/whatsapp/encryption";
import { supabaseAdmin } from "@/lib/flows/admin-client";

type EvolutionMessage = {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown>;
};

function textOf(data: EvolutionMessage) {
  const message = data.message ?? {};
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  const image = message.imageMessage as { caption?: string } | undefined;
  const video = message.videoMessage as { caption?: string } | undefined;
  return String(message.conversation || extended?.text || image?.caption || video?.caption || "");
}

function contentType(data: EvolutionMessage) {
  const type = data.messageType || "";
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  if (type.includes("document")) return "document";
  if (type.includes("location")) return "location";
  return "text";
}

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const payload = await request.json() as { event?: string; instance?: string; data?: EvolutionMessage };
    if (!token || !payload.instance) return NextResponse.json({ error: "Webhook inválido" }, { status: 401 });
    const db = supabaseAdmin();
    const { data: config } = await db.from("evolution_config").select("account_id, webhook_secret_encrypted").eq("instance_name", payload.instance).maybeSingle();
    if (!config?.webhook_secret_encrypted || decrypt(config.webhook_secret_encrypted) !== token) return NextResponse.json({ error: "Webhook não autorizado" }, { status: 401 });

    const event = (payload.event || "").toLowerCase().replaceAll("_", ".");
    if (event === "connection.update") {
      const state = String((payload.data as unknown as { state?: string })?.state || "disconnected");
      await db.from("evolution_config").update({ status: state }).eq("account_id", config.account_id);
      return NextResponse.json({ ok: true });
    }
    if (event !== "messages.upsert") return NextResponse.json({ ok: true });

    const data = payload.data ?? {};
    const jid = data.key?.remoteJid || "";
    if (data.key?.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") return NextResponse.json({ ok: true });
    const phone = jid.split("@")[0].replace(/\D/g, "");
    const externalId = data.key?.id;
    if (!phone || !externalId) return NextResponse.json({ ok: true });
    const { data: duplicate } = await db.from("messages").select("id").eq("message_id", externalId).maybeSingle();
    if (duplicate) return NextResponse.json({ ok: true });

    const { data: owner } = await db.from("profiles").select("user_id").eq("account_id", config.account_id).eq("account_role", "owner").limit(1).maybeSingle();
    if (!owner?.user_id) return NextResponse.json({ error: "Conta sem proprietário" }, { status: 500 });
    let { data: contact } = await db.from("contacts").select("id").eq("account_id", config.account_id).eq("phone_normalized", phone).maybeSingle();
    if (!contact) {
      const created = await db.from("contacts").insert({ account_id: config.account_id, user_id: owner.user_id, name: data.pushName || phone, phone, lead_source: "whatsapp" }).select("id").single();
      if (created.error) throw created.error;
      contact = created.data;
    }
    let { data: conversation } = await db.from("conversations").select("id, unread_count").eq("account_id", config.account_id).eq("contact_id", contact.id).neq("status", "closed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!conversation) {
      const created = await db.from("conversations").insert({ account_id: config.account_id, user_id: owner.user_id, contact_id: contact.id, status: "open", unread_count: 0 }).select("id, unread_count").single();
      if (created.error) throw created.error;
      conversation = created.data;
    }
    const contentText = textOf(data);
    const timestamp = Number(data.messageTimestamp || Date.now() / 1000);
    const createdAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000).toISOString();
    const { error: messageError } = await db.from("messages").insert({ conversation_id: conversation.id, sender_type: "customer", content_type: contentType(data), content_text: contentText || `[${data.messageType || "mensagem"}]`, message_id: externalId, status: "delivered", created_at: createdAt });
    if (messageError) throw messageError;
    await db.from("conversations").update({ last_message_text: contentText || `[${data.messageType || "mensagem"}]`, last_message_at: createdAt, unread_count: (conversation.unread_count || 0) + 1, updated_at: new Date().toISOString() }).eq("id", conversation.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[evolution/webhook]", error);
    return NextResponse.json({ error: "Falha ao processar evento" }, { status: 500 });
  }
}
