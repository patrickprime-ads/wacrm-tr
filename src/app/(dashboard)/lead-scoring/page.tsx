"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Search, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types";
import { Input } from "@/components/ui/input";

type ScoredLead = Contact & { score: number; reason: string };

const baseScore = {
  frio: 15,
  curioso: 35,
  interessado: 60,
  quente: 85,
  vendido: 100,
  perdido: 0,
} as const;

export default function LeadScoringPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const db = createClient();
    void db.from("contacts").select("*").order("updated_at", { ascending: false }).then(({ data }) => {
      setContacts((data as Contact[] | null) ?? []);
    });
  }, []);

  const leads = useMemo<ScoredLead[]>(() => {
    return contacts
      .map((contact) => {
        const classification = contact.lead_temperature ?? "curioso";
        let score: number = baseScore[classification];
        if (contact.lead_source === "meta_ads" || contact.lead_source === "google_ads") score += 5;
        if (contact.response_time_bucket === "Até 5 min") score += 5;
        score = Math.min(100, score);
        const reason =
          classification === "quente"
            ? "Alta intenção de compra"
            : classification === "interessado"
              ? "Demonstrou interesse"
              : classification === "vendido"
                ? "Venda concluída"
                : classification === "perdido"
                  ? "Venda perdida"
                  : "Ainda precisa de qualificação";
        return { ...contact, score, reason };
      })
      .filter((lead) => `${lead.name} ${lead.phone}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.score - a.score);
  }, [contacts, query]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Priorização comercial</p>
        <h1 className="text-2xl font-bold">Lead Scoring</h1>
        <p className="text-sm text-muted-foreground">Veja primeiro os leads com maior chance de avançar.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard label="Leads quentes" value={leads.filter((lead) => lead.score >= 80 && lead.score < 100).length} />
        <ScoreCard label="Interessados" value={leads.filter((lead) => lead.score >= 50 && lead.score < 80).length} />
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
