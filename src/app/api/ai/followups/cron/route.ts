import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendTextMessage } from "@/lib/whatsapp/meta-api";
import { runAgent } from "@/lib/ai/run-agent";

export const maxDuration = 60;

function hourInSaoPaulo() { return Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date())) % 24; }

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET || process.env.AUTOMATION_CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: jobs, error } = await db.from("ai_followup_jobs").select("*").eq("status", "scheduled").lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let sent = 0, skipped = 0, failed = 0;
  for (const job of jobs ?? []) {
    const { data: claim } = await db.from("ai_followup_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "scheduled").select("id").maybeSingle();
    if (!claim) continue;
    try {
      const [{ data: agent }, { data: conversation }, { data: contact }, { data: integration }, { data: whatsapp }, { data: messages }] = await Promise.all([
        db.from("ai_agents").select("*").eq("id", job.agent_id).eq("is_active", true).maybeSingle(),
        db.from("conversations").select("last_message_at, user_id").eq("id", job.conversation_id).maybeSingle(),
        db.from("contacts").select("phone, name").eq("id", job.contact_id).maybeSingle(),
        db.from("ai_integrations").select("provider,base_url,api_key_encrypted,default_model,is_active").eq("account_id", job.account_id).maybeSingle(),
        db.from("whatsapp_config").select("phone_number_id,access_token,status").eq("account_id", job.account_id).maybeSingle(),
        db.from("messages").select("sender_type,content_text,created_at").eq("conversation_id", job.conversation_id).order("created_at", { ascending: false }).limit(12),
      ]);
      if (!agent || !contact || !integration?.is_active || !whatsapp?.access_token || whatsapp.status !== "active") throw new Error("Agente, IA ou WhatsApp não está ativo");
      const latest = messages?.[0];
      if (latest?.sender_type === "customer") { await db.from("ai_followup_jobs").update({ status: "cancelled" }).eq("id", job.id); skipped++; continue; }
      const lastCustomer = messages?.find(m => m.sender_type === "customer");
      if (!lastCustomer || Date.now() - new Date(lastCustomer.created_at).getTime() >= 24 * 3_600_000) throw new Error("Janela de 24h encerrada; configure um template aprovado para continuar");
      const hour = hourInSaoPaulo();
      if (hour < agent.followup_start_hour || hour >= agent.followup_end_hour) { const next = new Date(); next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(Number(agent.followup_start_hour) + 3, 0, 0, 0); await db.from("ai_followup_jobs").update({ status: "scheduled", next_run_at: next.toISOString() }).eq("id", job.id); skipped++; continue; }
      const transcript = [...(messages ?? [])].reverse().map(m => `${m.sender_type === "customer" ? "Lead" : "Empresa"}: ${m.content_text || ""}`).join("\n");
      const result = await runAgent(integration, agent, `Crie um follow-up curto e natural para retomar esta conversa sem pressionar. Não invente condições. Retorne apenas a mensagem.\n\n${transcript}`);
      const output = await sendTextMessage({ phoneNumberId: whatsapp.phone_number_id, accessToken: decrypt(whatsapp.access_token), to: contact.phone, text: result.text });
      await db.from("messages").insert({ conversation_id: job.conversation_id, sender_type: "bot", sender_id: conversation?.user_id ?? null, content_type: "text", content_text: result.text, message_id: output.messageId, status: "sent" });
      const attempt = Number(job.attempt) + 1;
      const done = attempt >= Number(agent.followup_max_attempts);
      await db.from("ai_followup_jobs").update({ attempt, status: done ? "completed" : "scheduled", next_run_at: new Date(Date.now() + Number(agent.followup_delay_hours) * 3_600_000).toISOString(), last_error: null }).eq("id", job.id);
      await db.from("ai_agent_runs").insert({ account_id: job.account_id, conversation_id: job.conversation_id, agent_id: agent.id, triggered_by_user_id: conversation?.user_id ?? null, source: "followup", output_preview: result.text.slice(0, 1000), model: result.model, status: "completed", latency_ms: result.latencyMs });
      sent++;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha desconhecida";
      await db.from("ai_followup_jobs").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", job.id);
      failed++;
    }
  }
  return NextResponse.json({ processed: (jobs ?? []).length, sent, skipped, failed });
}
