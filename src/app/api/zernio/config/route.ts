import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import { zernioRequest, type ZernioConversation } from "@/lib/zernio/client";
import { importZernioConversation } from "@/lib/zernio/inbox";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const [{ data: config, error }, { data: channels }] = await Promise.all([
      ctx.supabase.from("zernio_config").select("profile_id, status, webhook_id").eq("account_id", ctx.accountId).maybeSingle(),
      ctx.supabase.from("zernio_channels").select("zernio_account_id, platform, username, display_name, is_active").eq("account_id", ctx.accountId),
    ]);
    if (error?.code === "42P01") return NextResponse.json({ error: "Execute a migration 044 no Supabase." }, { status: 409 });
    return NextResponse.json({ configured: !!config, profileId: config?.profile_id, status: config?.status || "disconnected", webhookConfigured: !!config?.webhook_id, channels: channels || [] });
  } catch (error) { return toErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = await request.json().catch(() => null) as { action?: string; apiKey?: string; profileId?: string } | null;
    const action = body?.action || "save";
    const admin = supabaseAdmin();
    const { data: account } = await admin.from("accounts").select("owner_user_id").eq("id", ctx.accountId).single();
    if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

    let apiKey = body?.apiKey?.trim() || "";
    const { data: existing } = await admin.from("zernio_config").select("api_key_encrypted, profile_id, webhook_id, webhook_secret_encrypted").eq("account_id", ctx.accountId).maybeSingle();
    if (!apiKey && existing?.api_key_encrypted) apiKey = decrypt(existing.api_key_encrypted);
    if (!apiKey) return NextResponse.json({ error: "Informe a API Key da Zernio" }, { status: 400 });

    if (action === "save") {
      const profileId = body?.profileId?.trim() || existing?.profile_id || null;
      const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
      const accountsResult = await zernioRequest(apiKey, `/accounts${query}`);
      const accounts = ((accountsResult.accounts || []) as { _id?: string; id?: string; platform?: string; username?: string; displayName?: string; isActive?: boolean; profileId?: { _id?: string } | string }[])
        .filter(item => (item._id || item.id) && ["whatsapp", "instagram", "facebook"].includes(item.platform || ""));
      if (!accounts.length) return NextResponse.json({ error: "Nenhum WhatsApp, Instagram ou Facebook conectado foi encontrado nessa chave." }, { status: 400 });
      const resolvedProfile = profileId || (typeof accounts[0].profileId === "string" ? accounts[0].profileId : accounts[0].profileId?._id) || null;
      const webhookSecret = existing?.webhook_secret_encrypted ? decrypt(existing.webhook_secret_encrypted) : crypto.randomUUID().replace(/-/g, "");
      const origin = new URL(request.url).origin;
      let webhookId = existing?.webhook_id || null;
      if (!webhookId) {
        const hook = await zernioRequest(apiKey, "/webhooks/settings", { method: "POST", body: JSON.stringify({ name: `CRM ${ctx.account.name}`.slice(0, 50), url: `${origin}/api/zernio/webhook?account=${encodeURIComponent(ctx.accountId)}`, secret: webhookSecret, events: ["message.received", "message.sent", "message.delivered", "message.read", "message.failed", "conversation.started", "account.disconnected"], isActive: true }) });
        const webhook = hook.webhook as { _id?: string } | undefined;
        webhookId = webhook?._id || null;
      }
      const { error: configError } = await admin.from("zernio_config").upsert({ account_id: ctx.accountId, api_key_encrypted: encrypt(apiKey), profile_id: resolvedProfile, webhook_id: webhookId, webhook_secret_encrypted: encrypt(webhookSecret), status: "connected", updated_at: new Date().toISOString() }, { onConflict: "account_id" });
      if (configError) return NextResponse.json({ error: configError.message.includes("schema cache") ? "Execute a migration 044 no Supabase." : configError.message }, { status: 409 });
      await admin.from("zernio_channels").upsert(accounts.map(item => ({ account_id: ctx.accountId, zernio_account_id: item._id || item.id, platform: item.platform, username: item.username || null, display_name: item.displayName || null, is_active: item.isActive !== false, updated_at: new Date().toISOString() })), { onConflict: "account_id,zernio_account_id" });
      return NextResponse.json({ ok: true, channels: accounts.length, webhookConfigured: !!webhookId });
    }

    if (action === "sync") {
      const { data: channels } = await admin.from("zernio_channels").select("zernio_account_id, platform").eq("account_id", ctx.accountId).eq("is_active", true);
      let imported = 0;
      for (const channel of channels || []) {
        const result = await zernioRequest(apiKey, `/inbox/conversations?platform=${encodeURIComponent(channel.platform)}&limit=100&sortOrder=desc`);
        const conversations = ((result.data || []) as ZernioConversation[]).filter(item => item.accountId === channel.zernio_account_id);
        for (const conversation of conversations) { await importZernioConversation(admin, ctx.accountId, account.owner_user_id, apiKey, conversation); imported += 1; }
      }
      return NextResponse.json({ ok: true, imported });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("[zernio/config]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na Zernio" }, { status: 500 });
  }
}
