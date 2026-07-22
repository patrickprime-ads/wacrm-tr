"use client";

import { useEffect, useState } from "react";
import { Bot, MessagesSquare, ShieldCheck, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

interface Summary {
  activeAgents: number;
  automaticConversations: number;
  runsToday: number;
  failuresToday: number;
}

export function AiOperationsSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const db = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    void Promise.all([
      db.from("ai_agents").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("conversation_ai_settings").select("id", { count: "exact", head: true }).eq("mode", "auto"),
      db.from("ai_agent_runs").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      db.from("ai_agent_runs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", today.toISOString()),
    ]).then(([agents, automatic, runs, failures]) => {
      setSummary({ activeAgents: agents.count ?? 0, automaticConversations: automatic.count ?? 0, runsToday: runs.count ?? 0, failuresToday: failures.count ?? 0 });
    });
  }, []);

  const items = [
    { label: "Agentes ativos", value: summary?.activeAgents, icon: Bot, tone: "text-primary", surface: "bg-primary/10" },
    { label: "Conversas automáticas", value: summary?.automaticConversations, icon: MessagesSquare, tone: "text-emerald-400", surface: "bg-emerald-500/10" },
    { label: "Execuções hoje", value: summary?.runsToday, icon: ShieldCheck, tone: "text-cyan-400", surface: "bg-cyan-500/10" },
    { label: "Falhas hoje", value: summary?.failuresToday, icon: TriangleAlert, tone: summary?.failuresToday ? "text-red-400" : "text-muted-foreground", surface: summary?.failuresToday ? "bg-red-500/10" : "bg-muted" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => <div key={item.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.surface} ${item.tone}`}><item.icon className="h-4 w-4" /></span><div><p className="text-xl font-bold tabular-nums">{summary ? item.value : "—"}</p><p className="text-xs text-muted-foreground">{item.label}</p></div></div>)}
    </div>
  );
}

