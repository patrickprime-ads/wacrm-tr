import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";

const ALLOWED = new Set(["lead", "qualified_lead", "opportunity", "customer", "lost"]);
const hash = (value: string) => crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const body = await request.json() as { contact_id?: string; status?: string; value?: number };
    if (!body.contact_id || !body.status || !ALLOWED.has(body.status)) return NextResponse.json({ error: "Contato ou conversão inválida" }, { status: 400 });
    const { data: contact, error } = await ctx.supabase.from("contacts").select("id,phone,email,click_id,lead_source").eq("id", body.contact_id).eq("account_id", ctx.accountId).single();
    if (error || !contact) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    // Curioso fica somente no CRM. As demais classificações geram um sinal
    // explícito para a plataforma de anúncios.
    const convertedAt = body.status === "lead" ? null : new Date().toISOString();
    const conversionValue = body.status === "customer" && Number.isFinite(body.value)
      ? Math.max(0, Number(body.value))
      : null;
    const { error: updateError } = await ctx.supabase.from("contacts").update({ conversion_status: body.status, converted_at: convertedAt, conversion_value: conversionValue }).eq("id", contact.id);
    if (updateError) throw updateError;
    const { data: settings } = await ctx.supabase
      .from("lead_tracking_settings")
      .select(
        "meta_enabled,meta_pixel_id,meta_access_token_encrypted,google_enabled,google_customer_id,google_conversion_action,google_access_token_encrypted,conversion_event",
      )
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    let meta: "sent" | "not_configured" | "failed" = "not_configured";
    if (settings?.meta_enabled && settings.meta_pixel_id && settings.meta_access_token_encrypted && convertedAt) {
      const metaEventName = body.status === "customer"
        ? "Purchase"
        : body.status === "lost"
          ? "DisqualifiedLead"
          : "QualifiedLead";
      const metaLeadStatus = body.status === "customer"
        ? "customer"
        : body.status === "lost"
          ? "disqualified"
          : "qualified";
      const userData: Record<string, unknown> = { ph: [hash(contact.phone.replace(/\D/g, ""))], external_id: [hash(contact.id)] };
      if (contact.email) userData.em = [hash(contact.email)];
      if (contact.click_id?.startsWith("fb.")) userData.fbc = contact.click_id;
      const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(settings.meta_pixel_id)}/events?access_token=${encodeURIComponent(decrypt(settings.meta_access_token_encrypted))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [{ event_name: metaEventName, event_time: Math.floor(Date.now() / 1000), action_source: "business_messaging", event_id: `${contact.id}-${body.status}`, user_data: userData, custom_data: { lead_status: metaLeadStatus, currency: "BRL", ...(conversionValue !== null ? { value: conversionValue } : {}) } }] }), signal: AbortSignal.timeout(15_000) });
      meta = response.ok ? "sent" : "failed";
    }
    let google: "sent" | "not_configured" | "failed" = "not_configured";
    const googleClickId =
      contact.click_id && !contact.click_id.startsWith("fb.")
        ? contact.click_id
        : null;
    if (
      settings?.google_enabled &&
      settings.google_customer_id &&
      settings.google_conversion_action &&
      settings.google_access_token_encrypted &&
      convertedAt &&
      body.status !== "lost" &&
      googleClickId
    ) {
      const customerId = settings.google_customer_id.replace(/\D/g, "");
      const response = await fetch(
        "https://datamanager.googleapis.com/v1/events:ingest",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${decrypt(settings.google_access_token_encrypted)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            destinations: [
              {
                operatingAccount: {
                  accountType: "GOOGLE_ADS",
                  accountId: customerId,
                },
                productDestinationId: settings.google_conversion_action.replace(
                  /\D/g,
                  "",
                ),
                reference: "google_ads_conversion",
              },
            ],
            events: [
              {
                eventTimestamp: convertedAt,
                transactionId: `${contact.id}-${body.status}`,
                eventSource: "WEB",
                adIdentifiers: { gclid: googleClickId },
                currency: "BRL",
                conversionValue: body.status === "customer" ? 1 : 0,
                destinationReferences: ["google_ads_conversion"],
              },
            ],
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      google = response.ok ? "sent" : "failed";
    }
    return NextResponse.json({ ok: true, meta, google });
  } catch (error) { return toErrorResponse(error); }
}
