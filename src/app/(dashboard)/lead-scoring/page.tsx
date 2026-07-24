"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Plus, Save, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Contact } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ScoredLead = Contact & { score: number; reason: string };

type CustomRule = {
  id: string;
  name: string;
  condition:
    | "existing_customer"
    | "not_customer"
    | "source"
    | "classification"
    | "response_time"
    | "has_name"
    | "no_name";
  value: string;
  points: number;
};

type ScoringRules = {
  frio: number;
  curioso: number;
  interessado: number;
  quente: number;
  vendido: number;
  perdido: number;
  paid_source_bonus: number;
  fast_response_bonus: number;
  frio_label: string;
  curioso_label: string;
  interessado_label: string;
  quente_label: string;
  vendido_label: string;
  perdido_label: string;
  custom_rules: CustomRule[];
};

type ScoreKey =
  | "frio"
  | "curioso"
  | "interessado"
  | "quente"
  | "vendido"
  | "perdido"
  | "paid_source_bonus"
  | "fast_response_bonus";

type LabelKey =
  | "frio_label"
  | "curioso_label"
  | "interessado_label"
  | "quente_label"
  | "vendido_label"
  | "perdido_label";

const DEFAULT_RULES: ScoringRules = {
  frio: 15,
  curioso: 35,
  interessado: 60,
  quente: 85,
  vendido: 100,
  perdido: 0,
  paid_source_bonus: 5,
  fast_response_bonus: 5,
  frio_label: "Frio",
  curioso_label: "Curioso",
  interessado_label: "Interessado",
  quente_label: "Quente",
  vendido_label: "Vendido",
  perdido_label: "Perdido",
  custom_rules: [],
};

function ruleMatches(contact: Contact, rule: CustomRule) {
  if (rule.condition === "existing_customer") {
    return contact.conversion_status === "customer" || contact.lead_temperature === "vendido";
  }
  if (rule.condition === "not_customer") {
    return contact.conversion_status !== "customer" && contact.lead_temperature !== "vendido";
  }
  if (rule.condition === "source") return contact.lead_source === rule.value;
  if (rule.condition === "classification") return contact.lead_temperature === rule.value;
  if (rule.condition === "response_time") return contact.response_time_bucket === rule.value;
  if (rule.condition === "has_name") {
    return Boolean(contact.name?.trim() && !/^\d+$/.test(contact.name.trim()));
  }
  if (rule.condition === "no_name") {
    return !contact.name?.trim() || /^\d+$/.test(contact.name.trim());
  }
  return false;
}

export default function LeadScoringPage() {
  const { accountId, canEditSettings } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [rules, setRules] = useState<ScoringRules>(DEFAULT_RULES);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const db = createClient();
    void Promise.all([
      db.from("contacts").select("*").order("updated_at", { ascending: false }),
      db
        .from("lead_tracking_settings")
        .select("scoring_rules")
        .eq("account_id", accountId)
        .maybeSingle(),
    ]).then(([contactsResult, settingsResult]) => {
      setContacts((contactsResult.data as Contact[] | null) ?? []);
      const stored = settingsResult.data?.scoring_rules as
        | Partial<ScoringRules>
        | undefined;
      if (stored) {
        setRules({
          ...DEFAULT_RULES,
          ...stored,
          custom_rules: Array.isArray(stored.custom_rules)
            ? stored.custom_rules
            : [],
        });
      }
    });
  }, [accountId]);

  async function saveRules() {
    if (!accountId || !canEditSettings) return;
    setSaving(true);
    const db = createClient();
    const { error } = await db
      .from("lead_tracking_settings")
      .upsert(
        { account_id: accountId, scoring_rules: rules },
        { onConflict: "account_id" },
      );
    setSaving(false);
    if (error) {
      toast.error("Execute a migration 037 no Supabase antes de salvar.");
      return;
    }
    toast.success("Regras de pontuação salvas para toda a equipe.");
  }

  const leads = useMemo<ScoredLead[]>(() => {
    return contacts
      .map((contact) => {
        const classification = contact.lead_temperature ?? "frio";
        let score: number = rules[classification];
        if (contact.lead_source === "meta_ads" || contact.lead_source === "google_ads") score += rules.paid_source_bonus;
        if (contact.response_time_bucket === "Até 5 min") score += rules.fast_response_bonus;
        const matchedRules = rules.custom_rules.filter((rule) =>
          ruleMatches(contact, rule),
        );
        score += matchedRules.reduce((sum, rule) => sum + rule.points, 0);
        score = Math.max(0, Math.min(100, score));
        const reason =
          matchedRules.map((rule) => rule.name).filter(Boolean).join(" · ") ||
          rules[`${classification}_label` as LabelKey];
        return { ...contact, score, reason };
      })
      .filter((lead) => `${lead.name} ${lead.phone}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.score - a.score);
  }, [contacts, query, rules]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Priorização comercial</p>
          <h1 className="text-2xl font-bold">Lead Scoring</h1>
          <p className="text-sm text-muted-foreground">Veja primeiro os leads com maior chance de avançar.</p>
        </div>
        {canEditSettings && (
          <Button variant="outline" onClick={() => setShowSettings((value) => !value)}>
            <Settings2 className="h-4 w-4" />
            Configurar pontuação
          </Button>
        )}
      </div>
      {showSettings && (
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Regras personalizadas</h2>
                <p className="text-xs text-muted-foreground">
                  Dê um nome, escolha quando aplicar e informe pontos positivos ou negativos.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRules((current) => ({
                    ...current,
                    custom_rules: [
                      ...current.custom_rules,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        condition: "existing_customer",
                        value: "",
                        points: -20,
                      },
                    ],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Adicionar regra
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {rules.custom_rules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-3 rounded-xl border bg-background/50 p-3 lg:grid-cols-[1.4fr_1fr_1fr_120px_40px] lg:items-end"
                >
                  <div>
                    <Label>Nome da regra</Label>
                    <Input
                      className="mt-1"
                      value={rule.name}
                      placeholder="Ex.: Já é cliente"
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          custom_rules: current.custom_rules.map((item) =>
                            item.id === rule.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Quando</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-sm"
                      value={rule.condition}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          custom_rules: current.custom_rules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  condition: event.target.value as CustomRule["condition"],
                                  value: "",
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      <option value="existing_customer">Já é cliente</option>
                      <option value="not_customer">Ainda não é cliente</option>
                      <option value="source">Origem é</option>
                      <option value="classification">Classificação é</option>
                      <option value="response_time">Tempo de resposta é</option>
                      <option value="has_name">Possui nome identificado</option>
                      <option value="no_name">Não possui nome identificado</option>
                    </select>
                  </div>
                  <RuleValue
                    rule={rule}
                    onChange={(value) =>
                      setRules((current) => ({
                        ...current,
                        custom_rules: current.custom_rules.map((item) =>
                          item.id === rule.id ? { ...item, value } : item,
                        ),
                      }))
                    }
                  />
                  <div>
                    <Label>Pontos</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={-100}
                      max={100}
                      value={rule.points}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          custom_rules: current.custom_rules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  points: Math.max(
                                    -100,
                                    Math.min(100, Number(event.target.value)),
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-400"
                    onClick={() =>
                      setRules((current) => ({
                        ...current,
                        custom_rules: current.custom_rules.filter(
                          (item) => item.id !== rule.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!rules.custom_rules.length && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma regra personalizada. Clique em Adicionar regra.
                </div>
              )}
            </div>
          </div>
          <div className="mb-5">
            <h2 className="font-semibold">Pontuação inicial por classificação</h2>
            <p className="text-xs text-muted-foreground">
              Estes são os pontos de partida antes das regras personalizadas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["frio", "Lead frio"],
              ["curioso", "Lead curioso"],
              ["interessado", "Lead interessado"],
              ["quente", "Lead quente"],
              ["vendido", "Venda concluída"],
              ["perdido", "Venda perdida"],
              ["paid_source_bonus", "Bônus Meta/Google"],
              ["fast_response_bonus", "Bônus resposta até 5 min"],
            ] as Array<[ScoreKey, string]>).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  max={100}
                  value={rules[key]}
                  onChange={(event) =>
                    setRules((current) => ({
                      ...current,
                      [key]: Math.max(0, Math.min(100, Number(event.target.value))),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={() => void saveRules()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar regras"}
          </Button>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard label={rules.quente_label} value={leads.filter((lead) => lead.score >= 80 && lead.score < 100).length} />
        <ScoreCard label={rules.interessado_label} value={leads.filter((lead) => lead.score >= 50 && lead.score < 80).length} />
        <ScoreCard label="Precisam de atenção" value={leads.filter((lead) => lead.score > 0 && lead.score < 50).length} />
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead..." className="pl-9" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {leads.map((lead) => (
          <div key={lead.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1.2fr_1fr_100px] md:items-center">
            <div>
              <strong className="block text-sm">{lead.name || lead.phone}</strong>
              <span className="text-xs text-muted-foreground">{lead.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {lead.score >= 80 ? <Flame className="h-4 w-4 text-orange-400" /> : <Sparkles className="h-4 w-4 text-primary" />}
              {lead.reason}
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-center text-sm font-bold text-primary">{lead.score} pontos</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></div>;
}

function RuleValue({
  rule,
  onChange,
}: {
  rule: CustomRule;
  onChange: (value: string) => void;
}) {
  const options =
    rule.condition === "source"
      ? [
          ["meta_ads", "Meta"],
          ["google_ads", "Google"],
          ["whatsapp", "WhatsApp"],
          ["referral", "Indicação"],
          ["presencial", "Presencial"],
          ["active_base", "Base ativa"],
          ["phone", "Ligação"],
        ]
      : rule.condition === "classification"
        ? [
            ["frio", "Frio"],
            ["curioso", "Curioso"],
            ["interessado", "Interessado"],
            ["quente", "Quente"],
            ["vendido", "Vendido"],
            ["perdido", "Perdido"],
          ]
        : rule.condition === "response_time"
          ? [
              ["Até 5 min", "Até 5 min"],
              ["5–15 min", "5–15 min"],
              ["15–30 min", "15–30 min"],
              ["30–60 min", "30–60 min"],
              ["Acima de 1 hora", "Acima de 1 hora"],
            ]
          : null;

  if (!options) {
    return (
      <div>
        <Label>Valor</Label>
        <div className="mt-1 flex h-10 items-center rounded-lg border bg-muted px-3 text-xs text-muted-foreground">
          Automático
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>Valor</Label>
      <select
        className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-sm"
        value={rule.value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
