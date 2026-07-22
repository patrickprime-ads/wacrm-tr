"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

interface AgentRun {
  id: string;
  source: string;
  status: "completed" | "failed";
  model: string | null;
  latency_ms: number | null;
  output_preview: string | null;
  error_message: string | null;
  created_at: string;
  agent: { name: string } | { name: string }[] | null;
}

export function AgentRunHistory() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);

  useEffect(() => {
    void createClient()
      .from("ai_agent_runs")
      .select("id, source, status, model, latency_ms, output_preview, error_message, created_at, agent:ai_agents(name)")
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => setRuns((data ?? []) as AgentRun[]));
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div><h2 className="text-sm font-semibold">Execuções recentes</h2><p className="text-xs text-muted-foreground">Testes e sugestões geradas no atendimento</p></div>
        </div>
        {runs && <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">Últimas {runs.length}</span>}
      </div>
      {runs === null ? (
        <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : runs.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">As execuções aparecerão aqui depois do primeiro teste.</div>
      ) : (
        <div className="divide-y divide-border">
          {runs.map((run) => {
            const agent = Array.isArray(run.agent) ? run.agent[0] : run.agent;
            return (
              <div key={run.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  {run.status === "completed" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                  <div className="min-w-0"><p className="text-sm"><strong>{agent?.name ?? "Agente removido"}</strong><span className="text-muted-foreground"> · {run.source === "playground" ? "Playground" : run.source === "auto_reply" ? "Automático" : "Inbox"}</span></p><p className="truncate text-xs text-muted-foreground">{run.status === "completed" ? run.output_preview : run.error_message}</p></div>
                </div>
                <div className="flex items-center gap-3 pl-7 text-[11px] text-muted-foreground sm:pl-0"><span>{run.model ?? "—"}</span>{run.latency_ms != null && <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{run.latency_ms} ms</span>}<time>{new Date(run.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
