"use client";

import { useEffect, useState } from "react";
import { Clock3, Loader2, MessageCircleMore } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Job = { id: string; next_run_at: string; attempt: number; status: string; contacts: { name: string | null; phone: string } | null; ai_agents: { name: string; followup_max_attempts: number } | null };

export function FollowupQueue() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => { void createClient().from("ai_followup_jobs").select("id,next_run_at,attempt,status,contacts(name,phone),ai_agents(name,followup_max_attempts)").in("status", ["scheduled", "failed"]).order("next_run_at").limit(12).then(({ data }) => setJobs((data ?? []) as unknown as Job[])); }, []);
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400"><MessageCircleMore className="h-5 w-5"/></span><div><h2 className="font-semibold">Fila de follow-ups</h2><p className="text-xs text-muted-foreground">Próximas retomadas automáticas dos agentes</p></div></div>{jobs === null ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div> : jobs.length === 0 ? <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum follow-up pendente.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{jobs.map(job => <div key={job.id} className="flex items-center justify-between rounded-xl border bg-background/50 p-3"><div><p className="text-sm font-medium">{job.contacts?.name || job.contacts?.phone || "Lead"}</p><p className="text-xs text-muted-foreground">{job.ai_agents?.name} · tentativa {job.attempt + 1}/{job.ai_agents?.followup_max_attempts}</p></div><span className={job.status === "failed" ? "text-xs text-destructive" : "flex items-center gap-1 text-xs text-muted-foreground"}>{job.status === "failed" ? "Falhou" : <><Clock3 className="h-3 w-3"/>{new Date(job.next_run_at).toLocaleString("pt-BR")}</>}</span></div>)}</div>}</section>;
}
