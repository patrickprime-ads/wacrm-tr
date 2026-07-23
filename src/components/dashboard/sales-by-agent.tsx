"use client";

import { useEffect, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";

type Row = { id: string; name: string; count: number; value: number };

export function SalesByAgent() {
  const { profile, accountRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void (async () => {
      const db = createClient();
      const { data: deals } = await db.from("deals").select("value, assigned_to, assignee:profiles!deals_assigned_to_fkey(id, full_name)").eq("status", "won");
      const grouped = new Map<string, Row>();
      for (const deal of deals ?? []) {
        const assignee = deal.assignee as unknown as { id: string; full_name: string } | null;
        if (!assignee) continue;
        if (accountRole === "agent" && assignee.id !== profile?.id) continue;
        const current = grouped.get(assignee.id) ?? { id: assignee.id, name: assignee.full_name || "Vendedor", count: 0, value: 0 };
        current.count += 1; current.value += Number(deal.value || 0); grouped.set(assignee.id, current);
      }
      setRows([...grouped.values()].sort((a, b) => b.value - a.value));
    })();
  }, [accountRole, profile?.id]);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <section className="rounded-xl border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Vendas por vendedor</h2><p className="text-xs text-muted-foreground">Negócios ganhos e valor vendido</p></div></div>{rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda atribuída no período.</p> : <div className="space-y-3">{rows.map((row, index) => <div key={row.id} className="flex items-center gap-3 rounded-lg border bg-background/40 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{index === 0 ? <Trophy className="h-4 w-4" /> : row.name.charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><strong className="truncate text-sm">{row.name}</strong><strong className="text-sm text-primary">{formatCurrency(row.value)}</strong></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{row.count} {row.count === 1 ? "venda" : "vendas"}</span><span>{total ? Math.round(row.value / total * 100) : 0}% do total</span></div></div></div>)}</div>}</section>;
}
