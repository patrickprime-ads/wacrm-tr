import { decrypt } from "@/lib/whatsapp/encryption";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";

export interface AiIntegrationRow {
  provider: string;
  base_url: string | null;
  api_key_encrypted: string | null;
  default_model: string;
}

export interface RunnableAgent {
  instructions: string;
  model: string | null;
  temperature: number;
  tone?: string;
  response_length?: string;
  use_emojis?: boolean;
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const response = result as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text.trim();
  if (!Array.isArray(response.output)) return "";
  return response.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as { type?: unknown; text?: unknown };
      return value.type === "output_text" && typeof value.text === "string" ? value.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function runAgent(integration: AiIntegrationRow, agent: RunnableAgent, input: string) {
  if (!integration.api_key_encrypted) throw new Error("A chave da API não está configurada");
  if (integration.provider !== "openai" && integration.provider !== "custom") {
    throw new Error("Este provedor ainda não possui executor compatível");
  }

  const baseUrl = assertSafeOutboundUrl(integration.base_url || "https://api.openai.com/v1")
    .toString()
    .replace(/\/$/, "");
  const model = agent.model || integration.default_model;
  const started = Date.now();
  const styleInstructions = [
    `Tom da conversa: ${agent.tone || "equilibrado"}.`,
    `Tamanho da resposta: ${agent.response_length || "curto"}.`,
    agent.use_emojis ? "Use emojis com moderação." : "Não use emojis.",
  ].join(" ");
  const requestBody: Record<string, unknown> = {
    model,
    instructions: `${agent.instructions}\n\nREGRAS DE ESTILO: ${styleInstructions}`,
    input,
    max_output_tokens: 500,
  };
  // Reasoning-model families control variability differently and may reject
  // sampling parameters. Keep temperature for compatible custom/legacy models.
  if (!model.startsWith("gpt-5")) requestBody.temperature = Number(agent.temperature);

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${decrypt(integration.api_key_encrypted)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(result?.error?.message || `O provedor respondeu HTTP ${response.status}`);
  const text = extractText(result);
  if (!text) throw new Error("O provedor não retornou texto");
  return { text, model, latencyMs: Date.now() - started };
}
