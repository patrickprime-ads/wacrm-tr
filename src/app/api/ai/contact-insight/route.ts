import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { runAgent } from "@/lib/ai/run-agent";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

interface InsightPayload {
  summary: string;
  interest_level: "cold" | "warm" | "hot";
  score: number;
  next_action: string;
  signals: string[];
}

function parseInsight(text: string): InsightPayload {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<InsightPayload>;
  const interest = ["cold", "warm", "hot"].includes(String(parsed.interest_level)) ? parsed.interest_level as InsightPayload["interest_level"] : "warm";
  if (typeof parsed.summary !== "string" || typeof parsed.next_action !== "string") throw new Error("A IA retornou uma análise incompleta");
  return {
    summary: parsed.summary.slice(0, 1200),
    interest_level: interest,
    score: Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0))),
    next_action: parsed.next_action.slice(0, 600),
    signals: Array.isArray(parsed.signals) ? parsed.signals.filter((item): item is string => typeof item === "string").slice(0, 6) : [],
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const limit = checkRateLimit(`ai-insight:${ctx.userId}`, { limit: 10, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as { conversation_id?: unknown; contact_id?: unknown } | null;
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
    const contactId = typeof body?.contact_id === "string" ? body.contact_id : "";
    if (!conversationId || !contactId) return NextResponse.json({ error: "Conversa ou contato não informado" }, { status: 400 });

    const [{ data: conversation }, { data: setting }, { data: integration }] = await Promise.all([
      ctx.supabase.from("conversations").select("id, contact_id").eq("id", conversationId).eq("contact_id", contactId).eq("account_id", ctx.accountId).maybeSingle(),
      ctx.supabase.from("conversation_ai_settings").select("agent_id").eq("conversation_id", conversationId).maybeSingle(),
      ctx.supabase.from("ai_integrations").select("provider, base_url, api_key_encrypted, default_model, is_active").eq("account_id", ctx.accountId).maybeSingle(),
    ]);
    if (!conversation) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    if (!integration?.is_active) return NextResponse.json({ error: "Ative a integração de IA primeiro" }, { status: 409 });

    let agentQuery = ctx.supabase.from("ai_agents").select("id, instructions, model, temperature").eq("account_id", ctx.accountId).eq("is_active", true);
    if (setting?.agent_id) agentQuery = agentQuery.eq("id", setting.agent_id);
    const { data: agent } = await agentQuery.order("created_at").limit(1).maybeSingle();
    if (!agent) return NextResponse.json({ error: "Ative um agente de IA primeiro" }, { status: 409 });

    const { data: messages } = await ctx.supabase.from("messages").select("sender_type, content_text").eq("conversation_id", conversationId).in("content_type", ["text", "template", "interactive"]).order("created_at", { ascending: false }).limit(30);
    const transcript = [...(messages ?? [])].reverse().map((message) => `${message.sender_type === "customer" ? "Lead" : "Empresa"}: ${(message.content_text || "").slice(0, 1200)}`).join("\n");
    if (!transcript) return NextResponse.json({ error: "Ainda não há mensagens suficientes para analisar" }, { status: 409 });
    const prompt = [
      "Analise comercialmente a conversa abaixo. Use somente evidências explícitas; não invente dados.",
      "Retorne JSON válido, sem markdown, exatamente neste formato:",
      '{"summary":"resumo em português","interest_level":"cold|warm|hot","score":0,"next_action":"próxima ação objetiva","signals":["sinal 1"]}',
      "A pontuação deve refletir intenção, urgência, fit e avanço da conversa.",
      transcript,
    ].join("\n\n");

    const result = await runAgent(integration, agent, prompt);
    const insight = parseInsight(result.text);
    const { data, error } = await ctx.supabase.from("ai_contact_insights").upsert({ account_id: ctx.accountId, contact_id: contactId, agent_id: agent.id, ...insight, analyzed_at: new Date().toISOString() }, { onConflict: "contact_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ insight: data });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "A IA retornou um formato inválido. Tente novamente." }, { status: 502 });
    return toErrorResponse(error);
  }
}

