import { isIP } from "node:net";

/** Blocks obvious SSRF targets before a server-side integration request. */
export function assertSafeOutboundUrl(raw: string): URL {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid-url");

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("private-url");
  }
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      throw new Error("private-url");
    }
  }
  if (isIP(host) === 6 && (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) {
    throw new Error("private-url");
  }
  return url;
}
