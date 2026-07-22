import type { SupabaseClient } from "@supabase/supabase-js";

export async function cancelFollowup(db: SupabaseClient, conversationId: string) {
  await db.from("ai_followup_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("conversation_id", conversationId).in("status", ["scheduled", "running"]);
}

export async function scheduleFollowup(db: SupabaseClient, accountId: string, conversationId: string, contactId: string) {
  const { data: setting } = await db.from("conversation_ai_settings").select("agent_id").eq("account_id", accountId).eq("conversation_id", conversationId).maybeSingle();
  if (!setting?.agent_id) return;
  const { data: agent } = await db.from("ai_agents").select("id, followup_enabled, followup_delay_hours").eq("id", setting.agent_id).eq("account_id", accountId).eq("is_active", true).maybeSingle();
  if (!agent?.followup_enabled) return;
  const nextRun = new Date(Date.now() + Number(agent.followup_delay_hours) * 3_600_000).toISOString();
  await db.from("ai_followup_jobs").upsert({ account_id: accountId, conversation_id: conversationId, contact_id: contactId, agent_id: agent.id, attempt: 0, next_run_at: nextRun, status: "scheduled", last_error: null, updated_at: new Date().toISOString() }, { onConflict: "conversation_id,agent_id" });
}
