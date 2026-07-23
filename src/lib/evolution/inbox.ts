import { supabaseAdmin } from "@/lib/flows/admin-client";

export type EvolutionMessage = {
  id?: string;
  key?: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    fromMe?: boolean;
  };
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown>;
};

function messageText(data: EvolutionMessage) {
  const message = data.message ?? {};
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  const image = message.imageMessage as { caption?: string } | undefined;
  const video = message.videoMessage as { caption?: string } | undefined;
  const document = message.documentMessage as { title?: string; fileName?: string } | undefined;
  return String(
    message.conversation ||
      extended?.text ||
      image?.caption ||
      video?.caption ||
      document?.title ||
      document?.fileName ||
      "",
  );
}

function contentType(data: EvolutionMessage) {
  const type = (data.messageType || Object.keys(data.message ?? {})[0] || "").toLowerCase();
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  if (type.includes("document")) return "document";
  if (type.includes("location")) return "location";
  return "text";
}

export async function importEvolutionMessage(accountId: string, data: EvolutionMessage) {
  const db = supabaseAdmin();
  const jid = data.key?.remoteJidAlt || data.key?.remoteJid || "";
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return "ignored" as const;

  const phone = jid.split("@")[0].replace(/\D/g, "");
  const externalId = data.key?.id || data.id;
  if (!phone || !externalId) return "ignored" as const;

  const { data: duplicate } = await db
    .from("messages")
    .select("id, conversations!inner(account_id)")
    .eq("message_id", externalId)
    .eq("conversations.account_id", accountId)
    .limit(1)
    .maybeSingle();
  if (duplicate) return "duplicate" as const;

  const { data: owner } = await db
    .from("profiles")
    .select("user_id")
    .eq("account_id", accountId)
    .in("account_role", ["owner", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) throw new Error("Conta sem proprietário ou administrador");

  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (!contact) {
    const created = await db
      .from("contacts")
      .insert({
        account_id: accountId,
        user_id: owner.user_id,
        name: data.pushName || phone,
        phone,
        lead_source: "whatsapp",
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    contact = created.data;
  }

  let { data: conversation } = await db
    .from("conversations")
    .select("id, unread_count")
    .eq("account_id", accountId)
    .eq("contact_id", contact.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    const created = await db
      .from("conversations")
      .insert({
        account_id: accountId,
        user_id: owner.user_id,
        contact_id: contact.id,
        status: "open",
        unread_count: 0,
      })
      .select("id, unread_count")
      .single();
    if (created.error) throw created.error;
    conversation = created.data;
  }

  const text = messageText(data);
  const fallback = `[${data.messageType || "mensagem"}]`;
  const timestamp = Number(data.messageTimestamp || Date.now() / 1000);
  const createdAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000).toISOString();
  const fromMe = data.key?.fromMe === true;
  const { error: messageError } = await db.from("messages").insert({
    conversation_id: conversation.id,
    sender_type: fromMe ? "agent" : "customer",
    sender_id: fromMe ? owner.user_id : null,
    content_type: contentType(data),
    content_text: text || fallback,
    message_id: externalId,
    status: fromMe ? "sent" : "delivered",
    created_at: createdAt,
  });
  if (messageError) throw messageError;

  await db
    .from("conversations")
    .update({
      last_message_text: text || fallback,
      last_message_at: createdAt,
      unread_count: fromMe ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);
  return "imported" as const;
}
