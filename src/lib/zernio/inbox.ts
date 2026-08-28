import type { SupabaseClient } from "@supabase/supabase-js";
import { zernioRequest, type ZernioConversation, type ZernioMessage } from "./client";

function contactKey(conversation: ZernioConversation) {
  if (conversation.platform === "whatsapp") return conversation.participantId.replace(/\D/g, "") || conversation.participantId;
  return `${conversation.platform}:${conversation.participantId}`;
}

export async function importZernioConversation(db: SupabaseClient, accountId: string, ownerId: string, apiKey: string, remote: ZernioConversation) {
  const phone = contactKey(remote);
  let { data: contact } = await db.from("contacts").select("id, name, avatar_url").eq("account_id", accountId).eq("phone", phone).maybeSingle();
  if (!contact) {
    const inserted = await db.from("contacts").insert({ account_id: accountId, user_id: ownerId, phone, name: remote.participantName || (remote.platform === "whatsapp" ? phone : remote.participantId), avatar_url: remote.participantPicture || null, lead_source: remote.platform, lead_temperature: "frio" }).select("id, name, avatar_url").single();
    if (inserted.error) throw inserted.error;
    contact = inserted.data;
  } else if ((remote.participantName && contact.name !== remote.participantName) || (remote.participantPicture && contact.avatar_url !== remote.participantPicture)) {
    await db.from("contacts").update({ name: remote.participantName || contact.name, avatar_url: remote.participantPicture || contact.avatar_url }).eq("id", contact.id);
  }

  let { data: local } = await db.from("conversations").select("id").eq("account_id", accountId).eq("external_provider", "zernio").eq("external_conversation_id", remote.id).maybeSingle();
  if (!local) {
    const inserted = await db.from("conversations").insert({ account_id: accountId, user_id: ownerId, contact_id: contact.id, channel: remote.platform, external_provider: "zernio", external_conversation_id: remote.id, external_account_id: remote.accountId, last_message_text: remote.lastMessage || null, last_message_at: remote.updatedTime || new Date().toISOString(), unread_count: remote.unreadCount || 0 }).select("id").single();
    if (inserted.error) throw inserted.error;
    local = inserted.data;
  } else {
    await db.from("conversations").update({ last_message_text: remote.lastMessage || null, last_message_at: remote.updatedTime || new Date().toISOString(), unread_count: remote.unreadCount || 0, channel: remote.platform, external_account_id: remote.accountId }).eq("id", local.id);
  }

  const result = await zernioRequest(apiKey, `/inbox/conversations/${encodeURIComponent(remote.id)}/messages?accountId=${encodeURIComponent(remote.accountId)}&limit=100&sortOrder=desc`);
  const messages = (result.messages || []) as ZernioMessage[];
  for (const message of messages.reverse()) {
    const { data: existing } = await db.from("messages").select("id").eq("message_id", message.id).maybeSingle();
    if (existing) continue;
    const attachment = message.attachments?.[0];
    const type = attachment?.type === "file" ? "document" : (["image", "video", "audio"].includes(attachment?.type || "") ? attachment?.type : "text");
    await db.from("messages").insert({ conversation_id: local.id, sender_type: message.direction === "incoming" ? "customer" : "agent", content_type: type, content_text: message.message || null, media_url: attachment?.refreshUrl || attachment?.url || null, message_id: message.id, status: "sent", created_at: message.createdAt || new Date().toISOString() });
  }
  return local.id;
}
