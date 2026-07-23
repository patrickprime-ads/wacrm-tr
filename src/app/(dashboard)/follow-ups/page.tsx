"use client";

import { FollowupQueue } from "@/components/ai/followup-queue";

export default function FollowUpsPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Retomadas comerciais
        </p>
        <h1 className="text-2xl font-bold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os retornos agendados, tentativas e falhas dos agentes de IA.
        </p>
      </div>
      <FollowupQueue />
    </div>
  );
}
