import { NextResponse } from "next/server";

import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { encrypt } from "@/lib/whatsapp/encryption";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";

const PROVIDERS = new Set(["openai", "anthropic", "google", "custom"]);

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from("ai_integrations")
      .select("id, provider, base_url, default_model, webhook_url, is_active, api_key_encrypted, webhook_secret_encrypted")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({
      integration: data
        ? {
            id: data.id,
            provider: data.provider,
            base_url: data.base_url,
            default_model: data.default_model,
            webhook_url: data.webhook_url,
            is_active: data.is_active,
            has_api_key: !!data.api_key_encrypted,
            has_webhook_secret: !!data.webhook_secret_encrypted,
          }
        : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

    const provider = typeof body.provider === "string" ? body.provider : "openai";
    const defaultModel = typeof body.default_model === "string" ? body.default_model.trim() : "";
    if (!PROVIDERS.has(provider) || !defaultModel) {
      return NextResponse.json({ error: "Provedor ou modelo inválido" }, { status: 400 });
    }

    const cleanUrl = (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return null;
      const parsed = assertSafeOutboundUrl(value.trim());
      return parsed.toString();
    };

    let baseUrl: string | null;
    let webhookUrl: string | null;
    try {
      baseUrl = cleanUrl(body.base_url);
      webhookUrl = cleanUrl(body.webhook_url);
    } catch {
      return NextResponse.json({ error: "Use URLs HTTP ou HTTPS válidas" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      account_id: ctx.accountId,
      provider,
      base_url: baseUrl,
      default_model: defaultModel.slice(0, 120),
      webhook_url: webhookUrl,
      is_active: body.is_active === true,
    };
    if (typeof body.api_key === "string" && body.api_key.trim()) {
      payload.api_key_encrypted = encrypt(body.api_key.trim());
    }
    if (typeof body.webhook_secret === "string" && body.webhook_secret.trim()) {
      payload.webhook_secret_encrypted = encrypt(body.webhook_secret.trim());
    }

    const { data, error } = await ctx.supabase
      .from("ai_integrations")
      .upsert(payload, { onConflict: "account_id" })
      .select("id, provider, base_url, default_model, webhook_url, is_active")
      .single();
    if (error) throw error;
    return NextResponse.json({ integration: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
