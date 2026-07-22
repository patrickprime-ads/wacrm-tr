import { NextResponse } from "next/server";

import { encrypt } from "@/lib/whatsapp/encryption";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase.from("lead_tracking_settings").select("meta_enabled, meta_pixel_id, meta_access_token_encrypted, google_enabled, google_customer_id, google_conversion_action, google_access_token_encrypted, conversion_event").eq("account_id", ctx.accountId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: data ? { ...data, meta_access_token_encrypted: undefined, google_access_token_encrypted: undefined, has_meta_token: !!data.meta_access_token_encrypted, has_google_token: !!data.google_access_token_encrypted } : null });
  } catch (error) { return toErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = await request.json() as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      account_id: ctx.accountId,
      meta_enabled: body.meta_enabled === true,
      meta_pixel_id: typeof body.meta_pixel_id === "string" ? body.meta_pixel_id.trim() || null : null,
      google_enabled: body.google_enabled === true,
      google_customer_id: typeof body.google_customer_id === "string" ? body.google_customer_id.trim() || null : null,
      google_conversion_action: typeof body.google_conversion_action === "string" ? body.google_conversion_action.trim() || null : null,
      conversion_event: typeof body.conversion_event === "string" ? body.conversion_event : "qualified_lead",
    };
    if (typeof body.meta_token === "string" && body.meta_token.trim()) payload.meta_access_token_encrypted = encrypt(body.meta_token.trim());
    if (typeof body.google_token === "string" && body.google_token.trim()) payload.google_access_token_encrypted = encrypt(body.google_token.trim());
    const { error } = await ctx.supabase.from("lead_tracking_settings").upsert(payload, { onConflict: "account_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return toErrorResponse(error); }
}
