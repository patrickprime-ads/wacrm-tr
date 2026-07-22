import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { runAgent } from "@/lib/ai/run-agent";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const limit = checkRateLimit(`ai-suggest:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as { conversation_id?: unknown; agent_id?: unknown } | null;
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
    const requestedAgentId = typeof body?.agent_id === "string" ? body.agent_id : null;
    if (!conversationId) return NextResponse.json({ error: "Conversa não informada" }, { status: 400 });

    const [{ data: conversation }, { data: agent }, { data: integration }] = await Promise.all([
      ctx.supabase.from("conversations").select("id, contact:contacts(name, company)").eq("id", conversationId).eq("account_id", ctx.accountId).maybeSingle(),
      (() => {
        let query = ctx.supabase.from("ai_agents").select("id, name, instructions, model, temperature").eq("account_id", ctx.accountId).eq("is_active", true);
        if (requestedAgentId) query = query.eq("id", requestedAgentId);
        return query.order("created_at").limit(1).maybeSingle();
      })(),
      ctx.supabase.from("ai_integrations").select("provider, base_url, api_key_encrypted, default_model, is_active").eq("account_id", ctx.accountId).maybeSingle(),
    ]);
    if (!conversation) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    if (!agent) return NextResponse.json({ error: "Ative um agente de IA primeiro" }, { status: 409 });
    if (!integration?.is_active) return NextResponse.json({ error: "Ative a integração de IA primeiro" }, { status: 409 });

    const { data: messages, error: messagesError } = await ctx.supabase
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", conversationId)
      .in("content_type", ["text", "template", "interactive"])
      .order("created_at", { ascending: false })
      .limit(12);
    if (messagesError) throw messagesError;

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    const transcript = [...(messages ?? [])].reverse().map((message) => {
      const speaker = message.sender_type === "customer" ? "Lead" : "Atendente";
      return `${speaker}: ${(message.content_text || "").slice(0, 1200)}`;
    }).join("\n");
    const input = [
      `Crie somente a próxima resposta para o lead${contact?.name ? ` ${contact.name}` : ""}${contact?.company ? ` da empresa ${contact.company}` : ""}.`,
      "Não explique seu raciocínio. Não invente preços, prazos ou políticas. Se faltar informação, faça uma pergunta curta.",
      "Histórico da conversa:",
      transcript || "Sem mensagens anteriores.",
    ].join("\n\n");

    try {
      const result = await runAgent(integration, agent, input);
      await ctx.supabase.from("ai_agent_runs").insert({ account_id: ctx.accountId, conversation_id: conversationId, agent_id: agent.id, triggered_by_user_id: ctx.userId, source: "inbox_suggestion", input_preview: input.slice(0, 500), output_preview: result.text.slice(0, 1000), model: result.model, status: "completed", latency_ms: result.latencyMs });
      return NextResponse.json({ suggestion: result.text, agent_name: agent.name, model: result.model, latency_ms: result.latencyMs });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha ao gerar resposta";
      await ctx.supabase.from("ai_agent_runs").insert({ account_id: ctx.accountId, conversation_id: conversationId, agent_id: agent.id, triggered_by_user_id: ctx.userId, source: "inbox_suggestion", input_preview: input.slice(0, 500), status: "failed", error_message: errorMessage.slice(0, 1000) });
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
