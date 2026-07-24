"use client";

import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Deal } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Activity = {
  id: string;
  description: string;
  created_at: string;
  actor_name?: string | null;
};

export function DealHistoryDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [loadedDealId, setLoadedDealId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !deal) return;
    const db = createClient();
    void db
      .from("deal_activities")
      .select("id,description,created_at,actor_name")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setActivities((data as unknown as Activity[] | null) ?? []);
        setLoadedDealId(deal.id);
      });
  }, [deal, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico da venda</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">{deal?.title}</p>
        {activities === null || loadedDealId !== deal?.id ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-3 rounded-xl border bg-card p-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <strong className="block text-sm">{activity.description}</strong>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.created_at).toLocaleString("pt-BR")}
                    {activity.actor_name ? ` · ${activity.actor_name}` : ""}
                  </span>
                </div>
              </div>
            ))}
            {!activities.length && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                O histórico começará a ser registrado após executar a migration 038.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
