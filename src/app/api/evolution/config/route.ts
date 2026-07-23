import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import { randomBytes } from "node:crypto";

type ConfigRow = {
  server_url: string;
  api_key_encrypted: string;
  instance_name: string;
  status: string;
  webhook_secret_encrypted?: string | null;
};

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, accountId: null, role: null };
  const { data } = await supabase.from("profiles").select("account_id, account_role").eq("user_id", user.id).maybeSingle();
  return { supabase, accountId: data?.account_id as string | null, role: data?.account_role as string | null };
}

function safeServerUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("A URL da Evolution precisa usar HTTPS.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    throw new Error("A Vercel não consegue acessar uma Evolution local. Use uma URL pública.");
  }
  return url.origin;
}

async function evolution(config: ConfigRow, path: string, init?: RequestInit) {
  const response = await fetch(`${config.server_url}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", apikey: decrypt(config.api_key_encrypted), ...init?.headers },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const value = data as { message?: string; error?: string; response?: { message?: string[] } };
    const message = value.message || value.error || value.response?.message?.join(", ") || `Evolution respondeu ${response.status}`;
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

function qrFrom(data: Record<string, unknown>) {
  const nested = (data.qrcode ?? data.qr) as Record<string, unknown> | undefined;
  const base64 = (data.base64 ?? nested?.base64) as string | undefined;
  const code = (data.code ?? nested?.code) as string | undefined;
  return { base64: base64?.startsWith("data:") ? base64 : base64 ? `data:image/png;base64,${base64}` : null, code: code ?? null };
}

export async function GET() {
  try {
    const { supabase, accountId } = await context();
    if (!accountId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const { data: config, error } = await supabase.from("evolution_config").select("server_url, api_key_encrypted, instance_name, status").eq("account_id", accountId).maybeSingle();
    if (error) return NextResponse.json({ error: "Execute a migração 031_evolution_api.sql no Supabase." }, { status: 500 });
    if (!config) return NextResponse.json({ configured: false, state: "disconnected" });
    try {
      const stateData = await evolution(config as ConfigRow, `/instance/connectionState/${encodeURIComponent(config.instance_name)}`);
      const state = ((stateData.instance as Record<string, unknown> | undefined)?.state ?? stateData.state ?? "disconnected") as string;
      await supabase.from("evolution_config").update({ status: state }).eq("account_id", accountId);
      return NextResponse.json({ configured: true, server_url: config.server_url, instance_name: config.instance_name, state });
    } catch (error) {
      return NextResponse.json({ configured: true, server_url: config.server_url, instance_name: config.instance_name, state: "disconnected", warning: error instanceof Error ? error.message : "Falha ao consultar a Evolution" });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, role } = await context();
    if (!accountId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Somente administradores podem configurar o WhatsApp." }, { status: 403 });
    const body = await request.json() as { action?: string; server_url?: string; api_key?: string; instance_name?: string };

    if (body.action === "save") {
      const serverUrl = safeServerUrl(body.server_url?.trim() || "");
      const instanceName = body.instance_name?.trim() || "";
      if (!/^[a-zA-Z0-9_-]{3,50}$/.test(instanceName)) return NextResponse.json({ error: "Use de 3 a 50 letras, números, hífen ou sublinhado no nome da instância." }, { status: 400 });
      const { data: existing } = await supabase.from("evolution_config").select("api_key_encrypted, webhook_secret_encrypted").eq("account_id", accountId).maybeSingle();
      const encryptedKey = body.api_key?.trim() ? encrypt(body.api_key.trim()) : existing?.api_key_encrypted;
      if (!encryptedKey) return NextResponse.json({ error: "Informe a chave global da Evolution API." }, { status: 400 });
      const webhookSecret = existing?.webhook_secret_encrypted || encrypt(randomBytes(32).toString("hex"));
      const { error } = await supabase.from("evolution_config").upsert({ account_id: accountId, server_url: serverUrl, instance_name: instanceName, api_key_encrypted: encryptedKey, webhook_secret_encrypted: webhookSecret, status: "disconnected" }, { onConflict: "account_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const { data: config, error } = await supabase.from("evolution_config").select("server_url, api_key_encrypted, instance_name, status, webhook_secret_encrypted").eq("account_id", accountId).maybeSingle();
    if (error || !config) return NextResponse.json({ error: "Salve a configuração da Evolution primeiro." }, { status: 400 });
    const instance = encodeURIComponent(config.instance_name);
    const origin = new URL(request.url).origin;
    const webhookSecret = config.webhook_secret_encrypted ? decrypt(config.webhook_secret_encrypted) : null;
    const configureWebhook = async () => {
      if (!webhookSecret) throw new Error("Salve novamente a configuração para gerar a segurança do webhook.");
      await evolution(config as ConfigRow, `/webhook/set/${instance}`, {
        method: "POST",
        body: JSON.stringify({ webhook: { enabled: true, url: `${origin}/api/evolution/webhook?token=${encodeURIComponent(webhookSecret)}`, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"] } }),
      });
    };

    if (body.action === "sync") {
      await configureWebhook();
      return NextResponse.json({ ok: true });
    }

    if (body.action === "connect") {
      try {
        // A maioria dos clientes já cria a instância no Evolution
        // Manager. Consultá-la primeiro também permite que instalações
        // configuradas com chave por instância gerem o QR sem precisar
        // da chave global exigida por /instance/create.
        const connected = await evolution(config as ConfigRow, `/instance/connect/${instance}`);
        await configureWebhook();
        return NextResponse.json({ ok: true, ...qrFrom(connected) });
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const missing = message.includes("not found") || message.includes("does not exist") || message.includes("não existe") || message.includes("404");
        if (!missing) throw error;
      }
      const created = await evolution(config as ConfigRow, "/instance/create", { method: "POST", body: JSON.stringify({ instanceName: config.instance_name, qrcode: true, integration: "WHATSAPP-BAILEYS" }) });
      await configureWebhook();
      return NextResponse.json({ ok: true, ...qrFrom(created) });
    }

    if (body.action === "logout") {
      await evolution(config as ConfigRow, `/instance/logout/${instance}`, { method: "DELETE" });
      await supabase.from("evolution_config").update({ status: "disconnected" }).eq("account_id", accountId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na Evolution API" }, { status: 500 });
  }
}
