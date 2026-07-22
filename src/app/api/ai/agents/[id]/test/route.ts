import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { runAgent } from "@/lib/ai/run-agent";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-test:${ctx.userId}`, { limit: 10, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      return NextResponse.json({ error: "A mensagem deve ter entre 1 e 4.000 caracteres" }, { status: 400 });
    }

    const [{ data: agent, error: agentError }, { data: integration, error: integrationError }] = await Promise.all([
      ctx.supabase.from("ai_agents").select("id, instructions, model, temperature").eq("id", id).eq("account_id", ctx.accountId).maybeSingle(),
      ctx.supabase.from("ai_integrations").select("provider, base_url, api_key_encrypted, default_model, is_active").eq("account_id", ctx.accountId).maybeSingle(),
    ]);
    if (agentError || !agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    if (integrationError || !integration?.is_active) return NextResponse.json({ error: "Ative e salve a integração de IA primeiro" }, { status: 409 });

    try {
      const result = await runAgent(integration, agent, message);
      await ctx.supabase.from("ai_agent_runs").insert({
        account_id: ctx.accountId,
        agent_id: agent.id,
        triggered_by_user_id: ctx.userId,
        source: "playground",
        input_preview: message.slice(0, 500),
        output_preview: result.text.slice(0, 1000),
        model: result.model,
        status: "completed",
        latency_ms: result.latencyMs,
      });
      return NextResponse.json(result);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Falha desconhecida";
      await ctx.supabase.from("ai_agent_runs").insert({
        account_id: ctx.accountId,
        agent_id: agent.id,
        triggered_by_user_id: ctx.userId,
        source: "playground",
        input_preview: message.slice(0, 500),
        status: "failed",
        error_message: messageText.slice(0, 1000),
      });
      return NextResponse.json({ error: messageText }, { status: 502 });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
