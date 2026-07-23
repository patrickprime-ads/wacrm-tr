import { decrypt } from "@/lib/whatsapp/encryption";

export type EvolutionConfig = {
  server_url: string;
  api_key_encrypted: string;
  instance_name: string;
};

export async function evolutionRequest(config: EvolutionConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${config.server_url}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", apikey: decrypt(config.api_key_encrypted), ...init?.headers },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const nested = data.response as { message?: string[] } | undefined;
    throw new Error(String(data.message || data.error || nested?.message?.join(", ") || `Evolution respondeu ${response.status}`));
  }
  return data;
}

export function evolutionQr(data: Record<string, unknown>) {
  const nested = (data.qrcode ?? data.qr) as Record<string, unknown> | undefined;
  const base64 = (data.base64 ?? nested?.base64) as string | undefined;
  const code = (data.code ?? nested?.code) as string | undefined;
  return { base64: base64?.startsWith("data:") ? base64 : base64 ? `data:image/png;base64,${base64}` : null, code: code ?? null };
}
