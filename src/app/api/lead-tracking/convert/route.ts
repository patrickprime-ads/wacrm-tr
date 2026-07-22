import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";

const ALLOWED = new Set(["lead", "qualified_lead", "opportunity", "customer", "lost"]);
const hash = (value: string) => crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const body = await request.json() as { contact_id?: string; status?: string };
    if (!body.contact_id || !body.status || !ALLOWED.has(body.status)) return NextResponse.json({ error: "Contato ou conversão inválida" }, { status: 400 });
    const { data: contact, error } = await ctx.supabase.from("contacts").select("id,phone,email,click_id,lead_source").eq("id", body.contact_id).eq("account_id", ctx.accountId).single();
    if (error || !contact) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    const convertedAt = body.status === "lead" || body.status === "lost" ? null : new Date().toISOString();
    const { error: updateError } = await ctx.supabase.from("contacts").update({ conversion_status: body.status, converted_at: convertedAt }).eq("id", contact.id);
    if (updateError) throw updateError;
    const { data: settings } = await ctx.supabase.from("lead_tracking_settings").select("meta_enabled,meta_pixel_id,meta_access_token_encrypted,conversion_event").eq("account_id", ctx.accountId).maybeSingle();
    let meta: "sent" | "not_configured" | "failed" = "not_configured";
    if (settings?.meta_enabled && settings.meta_pixel_id && settings.meta_access_token_encrypted && convertedAt) {
      const userData: Record<string, unknown> = { ph: [hash(contact.phone.replace(/\D/g, ""))], external_id: [hash(contact.id)] };
      if (contact.email) userData.em = [hash(contact.email)];
      if (contact.click_id?.startsWith("fb.")) userData.fbc = contact.click_id;
      const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(settings.meta_pixel_id)}/events?access_token=${encodeURIComponent(decrypt(settings.meta_access_token_encrypted))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [{ event_name: settings.conversion_event || "QualifiedLead", event_time: Math.floor(Date.now() / 1000), action_source: "business_messaging", event_id: `${contact.id}-${body.status}`, user_data: userData, custom_data: { lead_status: body.status } }] }), signal: AbortSignal.timeout(15_000) });
      meta = response.ok ? "sent" : "failed";
    }
    return NextResponse.json({ ok: true, meta });
  } catch (error) { return toErrorResponse(error); }
}
