import type { SupabaseClient } from "@supabase/supabase-js";

import { runAgent } from "@/lib/ai/run-agent";
import { sendTextMessage } from "@/lib/whatsapp/meta-api";
import { scheduleFollowup } from "@/lib/ai/followups";

interface AutoReplyInput {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  contactPhone: string;
  phoneNumberId: string;
  accessToken: string;
}

function currentHour(timeZone: string): number {
  const value = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone }).format(new Date());
  return Number(value) % 24;
}

export async function dispatchAutoReply(input: AutoReplyInput): Promise<void> {
  const { db, accountId, userId, conversationId } = input;
  const { data: setting } = await db
    .from("conversation_ai_settings")
    .select("agent_id, mode, max_auto_replies_24h, active_hour_start, active_hour_end, timezone, require_unassigned")
    .eq("conversation_id", conversationId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!setting || setting.mode !== "auto" || !setting.agent_id) return;

  if (setting.require_unassigned) {
    const { data: conversation } = await db.from("conversations").select("assigned_agent_id").eq("id", conversationId).maybeSingle();
    if (conversation?.assigned_agent_id) return;
  }

  let hour: number;
  try { hour = currentHour(setting.timezone); } catch { return; }
  if (hour < setting.active_hour_start || hour >= setting.active_hour_end) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db.from("ai_agent_runs").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("source", "auto_reply").eq("status", "completed").gte("created_at", since);
  if ((count ?? 0) >= setting.max_auto_replies_24h) return;

  const [{ data: agent }, { data: integration }, { data: messages }] = await Promise.all([
    db.from("ai_agents").select("id, name, instructions, model, temperature").eq("id", setting.agent_id).eq("is_active", true).maybeSingle(),
    db.from("ai_integrations").select("provider, base_url, api_key_encrypted, default_model, is_active").eq("account_id", accountId).maybeSingle(),
    db.from("messages").select("sender_type, content_text").eq("conversation_id", conversationId).in("content_type", ["text", "template", "interactive"]).order("created_at", { ascending: false }).limit(12),
  ]);
  if (!agent || !integration?.is_active) return;

  const transcript = [...(messages ?? [])].reverse().map((message) => `${message.sender_type === "customer" ? "Lead" : "Atendente"}: ${(message.content_text || "").slice(0, 1200)}`).join("\n");
  const prompt = [
    "Responda à última mensagem do lead como atendente da empresa.",
    "Seja breve e natural. Não invente preços, prazos, descontos ou políticas.",
    "Se a mensagem exigir decisão humana, responda que um especialista continuará o atendimento e não prometa prazo.",
    "Retorne apenas o texto que será enviado no WhatsApp.",
    transcript,
  ].join("\n\n");

  try {
    const result = await runAgent(integration, agent, prompt);
    const sent = await sendTextMessage({ phoneNumberId: input.phoneNumberId, accessToken: input.accessToken, to: input.contactPhone, text: result.text });
    await db.from("messages").insert({ conversation_id: conversationId, sender_type: "bot", sender_id: userId, content_type: "text", content_text: result.text, message_id: sent.messageId, status: "sent", created_at: new Date().toISOString() });
    await db.from("conversations").update({ last_message_text: result.text, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversationId);
    await scheduleFollowup(db, accountId, conversationId, input.contactId);
    await db.from("ai_agent_runs").insert({ account_id: accountId, conversation_id: conversationId, agent_id: agent.id, triggered_by_user_id: userId, source: "auto_reply", input_preview: prompt.slice(0, 500), output_preview: result.text.slice(0, 1000), model: result.model, status: "completed", latency_ms: result.latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await db.from("ai_agent_runs").insert({ account_id: accountId, conversation_id: conversationId, agent_id: agent.id, triggered_by_user_id: userId, source: "auto_reply", input_preview: prompt.slice(0, 500), status: "failed", error_message: message.slice(0, 1000) });
    // Fail closed: transfer the conversation to human handling.
    await db.from("conversation_ai_settings").update({ mode: "assist" }).eq("conversation_id", conversationId);
  }
}
