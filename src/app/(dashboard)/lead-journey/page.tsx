"use client";

import { useEffect, useMemo, useState } from "react";
import { Route, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";

type JourneyLead = {
  id: string;
  name: string | null;
  phone: string;
  lead_source: string | null;
  created_at: string;
  deals?: Array<{
    status: string;
    stage?: { name?: string } | null;
    updated_at: string;
  }>;
};

const sourceLabel: Record<string, string> = {
  meta_ads: "Meta",
  google_ads: "Google",
  whatsapp: "WhatsApp",
  referral: "Indicação",
  presencial: "Presencial",
  active_base: "Base ativa",
  phone: "Ligação",
};

export default function LeadJourneyPage() {
  const [leads, setLeads] = useState<JourneyLead[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const db = createClient();
    void db
      .from("contacts")
      .select("id,name,phone,lead_source,created_at,deals(status,updated_at,stage:pipeline_stages(name))")
      .order("created_at", { ascending: false })
      .then(({ data }) => setLeads((data as JourneyLead[] | null) ?? []));
  }, []);

  const visible = useMemo(
    () =>
      leads.filter((lead) =>
        `${lead.name || ""} ${lead.phone}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [leads, query],
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Caminho comercial
        </p>
        <h1 className="text-2xl font-bold">Jornada do Lead</h1>
        <p className="text-sm text-muted-foreground">
          Veja de onde cada lead veio e até qual etapa da venda avançou.
        </p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar lead..."
          className="pl-9"
        />
      </div>
      <div className="grid gap-3">
        {visible.map((lead) => {
          const latest = [...(lead.deals ?? [])].sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          )[0];
          const destination =
            latest?.status === "won"
              ? "Venda ganha"
              : latest?.status === "lost"
                ? "Venda perdida"
                : latest?.stage?.name || "Novo lead";
          return (
            <div key={lead.id} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1.2fr_1fr_1fr] md:items-center">
              <div>
                <strong className="block text-sm">{lead.name || lead.phone}</strong>
                <span className="text-xs text-muted-foreground">{lead.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-full bg-violet-500/15 px-2 py-1 text-xs text-violet-300">
                  {sourceLabel[lead.lead_source || ""] || lead.lead_source || "Origem não informada"}
                </span>
                <Route className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <strong className="block text-sm">{destination}</strong>
                <span className="text-xs text-muted-foreground">
                  Entrada em {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          );
        })}
        {!visible.length && (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum lead encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
