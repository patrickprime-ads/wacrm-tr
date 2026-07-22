import crypto from "crypto";
import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
    if (body?.kind !== "ai" && body?.kind !== "webhook") {
      return NextResponse.json({ error: "Tipo de teste inválido" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("ai_integrations")
      .select("provider, base_url, api_key_encrypted, default_model, webhook_url, webhook_secret_encrypted, is_active")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Salve a integração antes de testar" }, { status: 409 });

    if (body.kind === "webhook") {
      if (!data.webhook_url) return NextResponse.json({ error: "Configure a URL do webhook" }, { status: 409 });
      const payload = JSON.stringify({ event: "integration.test", created_at: new Date().toISOString(), account_id: ctx.accountId });
      const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "WACRM-Webhook/1.0" };
      if (data.webhook_secret_encrypted) {
        const secret = decrypt(data.webhook_secret_encrypted);
        headers["x-wacrm-signature"] = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
      }
      const webhookUrl = assertSafeOutboundUrl(data.webhook_url);
      const response = await fetch(webhookUrl, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return NextResponse.json({ error: `O destino respondeu HTTP ${response.status}` }, { status: 502 });
      return NextResponse.json({ ok: true, status: response.status });
    }

    if (!data.api_key_encrypted) return NextResponse.json({ error: "Configure e salve a chave da API" }, { status: 409 });
    if (data.provider !== "openai" && data.provider !== "custom") {
      return NextResponse.json({ error: "O teste automático está disponível para OpenAI e APIs compatíveis" }, { status: 400 });
    }

    const apiKey = decrypt(data.api_key_encrypted);
    const baseUrl = assertSafeOutboundUrl(data.base_url || "https://api.openai.com/v1").toString().replace(/\/$/, "");
    const started = Date.now();
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: data.default_model, input: "Responda somente: conexão validada", max_output_tokens: 24 }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => null) as { error?: { message?: string }; output_text?: string } | null;
    if (!response.ok) {
      return NextResponse.json({ error: result?.error?.message || `O provedor respondeu HTTP ${response.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, latency_ms: Date.now() - started, response: result?.output_text ?? null });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "O serviço não respondeu dentro do limite" }, { status: 504 });
    }
    return toErrorResponse(error);
  }
}
