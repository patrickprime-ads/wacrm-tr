"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Save, Search, Settings2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Contact } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ScoredLead = Contact & { score: number; reason: string };

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
};

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
      if (stored) setRules({ ...DEFAULT_RULES, ...stored });
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
        const classification = contact.lead_temperature ?? "curioso";
        let score: number = rules[classification];
        if (contact.lead_source === "meta_ads" || contact.lead_source === "google_ads") score += rules.paid_source_bonus;
        if (contact.response_time_bucket === "Até 5 min") score += rules.fast_response_bonus;
        score = Math.min(100, score);
        const reason = rules[`${classification}_label` as LabelKey];
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
            <h2 className="font-semibold">Nomes das classificações</h2>
            <p className="text-xs text-muted-foreground">
              Personalize como cada nível aparece para sua equipe.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["frio_label", "Nome para lead frio"],
                ["curioso_label", "Nome para lead curioso"],
                ["interessado_label", "Nome para lead interessado"],
                ["quente_label", "Nome para lead quente"],
                ["vendido_label", "Nome para venda concluída"],
                ["perdido_label", "Nome para venda perdida"],
              ] as Array<[LabelKey, string]>).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    className="mt-1"
                    value={rules[key]}
                    onChange={(event) =>
                      setRules((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <h2 className="mb-3 font-semibold">Pontos de cada regra</h2>
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
