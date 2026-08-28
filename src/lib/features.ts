export type FeatureKey =
  | "dashboard" | "contacts" | "pipeline" | "inbox" | "lead_scoring"
  | "follow_ups" | "lead_tracking" | "ai_agents"
  | "automations" | "reports" | "broadcasts" | "flows"
  | "integrations" | "templates" | "settings";

export type Plan = "free" | "pro" | "business" | "enterprise";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: "Painel", contacts: "Contatos", pipeline: "Pipeline de vendas",
  inbox: "Caixa de entrada", lead_scoring: "Lead Scoring",
  follow_ups: "Follow-ups",
  lead_tracking: "Tracking de leads", ai_agents: "Agentes IA",
  automations: "Automações", reports: "Relatórios", broadcasts: "Disparos",
  flows: "Fluxos", integrations: "Integrações", templates: "Modelos",
  settings: "Configurações",
};

export const ALL_FEATURES = Object.keys(FEATURE_LABELS) as FeatureKey[];

export const PLAN_FEATURES: Record<Plan, FeatureKey[]> = {
  free: ["dashboard", "contacts", "follow_ups", "settings"],
  pro: ["dashboard", "contacts", "follow_ups", "settings", "pipeline", "inbox", "lead_scoring", "reports"],
  business: ["dashboard", "contacts", "follow_ups", "settings", "pipeline", "inbox", "lead_scoring", "reports", "lead_tracking", "ai_agents", "automations", "broadcasts", "flows"],
  enterprise: ALL_FEATURES,
};

export const DEFAULT_AGENT_FEATURES: FeatureKey[] = [
  "dashboard", "pipeline", "inbox", "contacts", "follow_ups",
];
