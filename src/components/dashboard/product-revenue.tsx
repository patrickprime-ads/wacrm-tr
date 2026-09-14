"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";

type ProductRow = { name: string; sales: number; revenue: number };

/**
 * Revenue is credited once to the complete product combination in a deal.
 * We intentionally do not split a combo's value between its products: that
 * keeps the number equal to the sale total and makes combos actionable.
 */
export function ProductRevenue() {
  const [rows, setRows] = useState<ProductRow[] | null>(null);

  useEffect(() => {
    const db = createClient();
    void db
      .from("deals")
      .select("value, selected_products")
      .eq("status", "won")
      .then(({ data }) => {
        const byProduct = new Map<string, ProductRow>();
        for (const deal of data ?? []) {
          const products = Array.isArray(deal.selected_products)
            ? deal.selected_products.filter(Boolean)
            : [];
          if (!products.length) continue;
          const name = products.join(" + ");
          const current = byProduct.get(name) ?? { name, sales: 0, revenue: 0 };
          current.sales += 1;
          current.revenue += Number(deal.value || 0);
          byProduct.set(name, current);
        }
        setRows([...byProduct.values()].sort((a, b) => b.revenue - a.revenue));
      });
  }, []);

  const total = useMemo(() => (rows ?? []).reduce((sum, row) => sum + row.revenue, 0), [rows]);
  const topRevenue = rows?.[0] ?? null;
  const topSales = rows?.slice().sort((a, b) => b.sales - a.sales)[0] ?? null;
  const max = topRevenue?.revenue || 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <PackageOpen className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Receita por produto ou combo</h2>
          <p className="text-xs text-muted-foreground">Vendas ganhas agrupadas pelo produto ou combinação escolhida.</p>
        </div>
      </div>
      {rows === null ? <Skeleton className="h-52 w-full" /> : rows.length === 0 ? <EmptyState icon={PackageOpen} title="Nenhuma venda com produto ainda" hint="Ao registrar uma venda, selecione os produtos para acompanhar esta métrica." /> : <>
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <Summary label="Maior receita" value={topRevenue ? `${topRevenue.name} · ${formatCurrency(topRevenue.revenue)}` : "—"} />
          <Summary label="Mais vendido" value={topSales ? `${topSales.name} · ${topSales.sales} ${topSales.sales === 1 ? "venda" : "vendas"}` : "—"} />
          <Summary label="Receita analisada" value={formatCurrency(total)} />
        </div>
        <div className="space-y-3">
          {rows.slice(0, 6).map((row) => <div key={row.name} className="grid items-center gap-2 md:grid-cols-[minmax(180px,0.8fr)_minmax(160px,1.8fr)_110px]">
            <div className="min-w-0"><strong className="block truncate text-sm">{row.name}</strong><span className="text-xs text-muted-foreground">{row.sales} {row.sales === 1 ? "venda" : "vendas"}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-pink-500" style={{ width: `${Math.max(2, (row.revenue / max) * 100)}%` }} /></div>
            <div className="text-right"><strong className="block text-sm tabular-nums">{formatCurrency(row.revenue)}</strong><span className="text-xs text-muted-foreground">{total ? `${((row.revenue / total) * 100).toFixed(1).replace('.', ',')}% da receita` : "—"}</span></div>
          </div>)}
        </div>
      </>}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/30 p-3"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><strong className="mt-1 block truncate text-sm">{value}</strong></div>;
}
