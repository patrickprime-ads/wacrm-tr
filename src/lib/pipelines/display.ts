export const DEFAULT_PIPELINE_NAME = "Funil de vendas";

export const DEFAULT_PIPELINE_STAGES = [
  { name: "Novo lead", color: "#3b82f6", position: 0 },
  { name: "Qualificado", color: "#eab308", position: 1 },
  { name: "Proposta enviada", color: "#f97316", position: 2 },
  { name: "Negociação", color: "#8b5cf6", position: 3 },
  { name: "Ganho", color: "#22c55e", position: 4 },
] as const;

const LEGACY_PIPELINE_NAMES: Record<string, string> = {
  "Sales Pipeline": DEFAULT_PIPELINE_NAME,
};

const LEGACY_STAGE_NAMES: Record<string, string> = {
  "New Lead": "Novo lead",
  Qualified: "Qualificado",
  "Proposal Sent": "Proposta enviada",
  Negotiation: "Negociação",
  Won: "Ganho",
};

export function displayPipelineName(name: string): string {
  return LEGACY_PIPELINE_NAMES[name] ?? name;
}

export function displayStageName(name: string): string {
  return LEGACY_STAGE_NAMES[name] ?? name;
}
