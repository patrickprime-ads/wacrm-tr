import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { zernioRequest, type ZernioConversation } from "@/lib/zernio/client";
import { importZernioConversation } from "@/lib/zernio/inbox";

function deepString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of keys) if (typeof row[key] === "string") return row[key] as string;
  for (const nested of Object.values(row)) { const found = deepString(nested, keys); if (found) return found; }
  return null;
}

export async function POST(request: Request) {
  const accountId = new URL(request.url).searchParams.get("account");
  if (!accountId) return NextResponse.json({ error: "Conta ausente" }, { status: 400 });
  const raw = await request.text();
  const db = supabaseAdmin();
  const { data: config } = await db.from("zernio_config").select("api_key_encrypted, webhook_secret_encrypted").eq("account_id", accountId).maybeSingle();
  if (!config) return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 });
  const secret = decrypt(config.webhook_secret_encrypted);
  const received = (request.headers.get("x-zernio-signature") || "").replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const valid = received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const remoteAccountId = deepString(payload, ["accountId"]);
  const conversationId = deepString(payload, ["conversationId"]);
  if (!remoteAccountId || !conversationId) return NextResponse.json({ ok: true, ignored: true });
  const { data: channel } = await db.from("zernio_channels").select("platform").eq("account_id", accountId).eq("zernio_account_id", remoteAccountId).eq("is_active", true).maybeSingle();
  if (!channel) return NextResponse.json({ ok: true, ignored: true });
  try {
    const apiKey = decrypt(config.api_key_encrypted);
    const result = await zernioRequest(apiKey, `/inbox/conversations/${encodeURIComponent(conversationId)}?accountId=${encodeURIComponent(remoteAccountId)}`);
    const remote = (result.data || result.conversation || result) as ZernioConversation;
    remote.id ||= conversationId; remote.accountId ||= remoteAccountId; remote.platform ||= channel.platform;
    const { data: account } = await db.from("accounts").select("owner_user_id").eq("id", accountId).single();
    if (account) await importZernioConversation(db, accountId, account.owner_user_id, apiKey, remote);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[zernio/webhook]", error);
    return NextResponse.json({ error: "Falha ao importar evento" }, { status: 500 });
  }
}
