import { createHash, randomBytes } from "crypto";

/** Token que o painel de rastreio usa para mandar leads a uma conta. Só o hash fica no banco. */
export function generateInboundToken(): string {
  return `prm_${randomBytes(24).toString("base64url")}`;
}

export function hashInboundToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match?.[1] || new URL(request.url).searchParams.get("token") || "").trim();
}
