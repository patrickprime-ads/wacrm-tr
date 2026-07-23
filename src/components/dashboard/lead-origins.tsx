"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types";

const sourceLabel: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  referral: "Indicação",
  presencial: "Presencial",
  whatsapp: "WhatsApp",
};

export function LeadOrigins() {
  const [leads, setLeads] = useState<Contact[]>([]);

  useEffect(() => {
    const db = createClient();
    void db
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setLeads((data as Contact[] | null) ?? []));
  }, []);

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Origem dos leads recentes</h2>
          <p className="text-xs text-muted-foreground">
            Campanha, anúncio e URL que trouxeram cada contato
          </p>
        </div>
      </div>
      <div className="divide-y">
        {leads.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">
            Nenhum lead recebido ainda.
          </p>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} className="grid gap-2 py-3 md:grid-cols-[1.2fr_0.8fr_1.4fr]">
              <div className="min-w-0">
                <strong className="block truncate text-sm">
                  {lead.name || lead.phone}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {sourceLabel[lead.lead_source ?? ""] || lead.lead_source || "Origem não identificada"}
                </span>
              </div>
              <div className="min-w-0 text-xs">
                <span className="block truncate text-foreground">
                  {lead.source_detail || lead.utm_campaign || "Sem campanha identificada"}
                </span>
                <span className="block truncate text-muted-foreground">
                  {lead.adset_id ? `Conjunto: ${lead.adset_id}` : ""}
                  {lead.ad_id ? `${lead.adset_id ? " · " : ""}Anúncio: ${lead.ad_id}` : ""}
                </span>
              </div>
              <div className="min-w-0">
                {lead.source_url ? (
                  <a
                    href={lead.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <span className="truncate">{lead.source_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    URL não enviada pela plataforma
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
