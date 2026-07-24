"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, Loader2, MessageCircleMore } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const IDEAL_ATTEMPTS = 7;

type Job = {
  id: string;
  next_run_at: string;
  attempt: number;
  status: string;
  contacts: { name: string | null; phone: string } | null;
  ai_agents: { name: string } | null;
};

export function FollowupQueue() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    void createClient()
      .from("ai_followup_jobs")
      .select("id,next_run_at,attempt,status,contacts(name,phone),ai_agents(name)")
      .in("status", ["scheduled", "failed", "running"])
      .order("next_run_at")
      .limit(100)
      .then(({ data }) => setJobs((data ?? []) as unknown as Job[]));
  }, []);

  const counts = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return {
      overdue: jobs?.filter((job) => job.status !== "failed" && new Date(job.next_run_at) < start).length ?? 0,
      today: jobs?.filter((job) => {
        const date = new Date(job.next_run_at);
        return job.status !== "failed" && date >= start && date <= end;
      }).length ?? 0,
      next: jobs?.filter((job) => job.status !== "failed" && new Date(job.next_run_at) > end).length ?? 0,
    };
  }, [jobs]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={AlertTriangle} label="Atrasados" value={counts.overdue} tone="text-red-400" />
        <Summary icon={Clock3} label="Para hoje" value={counts.today} tone="text-amber-400" />
        <Summary icon={CalendarClock} label="Próximos" value={counts.next} tone="text-cyan-400" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
            <MessageCircleMore className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">Fila de follow-ups</h2>
            <p className="text-xs text-muted-foreground">
              Meta recomendada: 7 tentativas por lead antes de encerrar.
            </p>
          </div>
        </div>
        {jobs === null ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum follow-up pendente.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {jobs.map((job) => {
              const current = Math.min(IDEAL_ATTEMPTS, job.attempt + 1);
              const progress = Math.round((current / IDEAL_ATTEMPTS) * 100);
              return (
                <div key={job.id} className="rounded-xl border bg-background/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {job.contacts?.name || job.contacts?.phone || "Lead"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {job.ai_agents?.name || "Agente de IA"}
                      </p>
                    </div>
                    <span className={job.status === "failed" ? "text-xs text-destructive" : "flex items-center gap-1 text-xs text-muted-foreground"}>
                      {job.status === "failed" ? "Falhou" : <><Clock3 className="h-3 w-3" />{new Date(job.next_run_at).toLocaleString("pt-BR")}</>}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <strong>Follow-up {current} de {IDEAL_ATTEMPTS}</strong>
                    <span className="text-muted-foreground">{IDEAL_ATTEMPTS - current} restantes</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof Clock3; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className={`h-4 w-4 ${tone}`} />
      <span className="mt-2 block text-xs text-muted-foreground">{label}</span>
      <strong className="text-2xl">{value}</strong>
    </div>
  );
}
