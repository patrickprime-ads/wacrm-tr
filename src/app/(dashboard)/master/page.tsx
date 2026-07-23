"use client";
import { useEffect, useState } from "react";
import { Building2, DollarSign, Loader2, Users, UserRound } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

type AccountRow = { id: string; name: string; sellers: number; contacts: number; conversations: number; wonDeals: number; revenue: number; openPipeline: number };
export default function MasterPage() {
  const [data, setData] = useState<{ accounts: AccountRow[]; totals: { accounts: number; sellers: number; revenue: number; contacts: number } } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/master/summary").then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then(setData).catch(e => setError(e.message)); }, []);
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">{error}</div>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const cards = [["Empresas", data.totals.accounts, Building2], ["Vendedores", data.totals.sellers, Users], ["Contatos", data.totals.contacts, UserRound], ["Vendas totais", formatCurrency(data.totals.revenue), DollarSign]] as const;
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin Master</p><h1 className="text-2xl font-bold">Visão geral das empresas</h1><p className="text-sm text-muted-foreground">Resultados consolidados de todos os clientes.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><strong className="text-xl">{value}</strong></div>)}</div><div className="overflow-hidden rounded-xl border bg-card"><div className="border-b p-4 font-semibold">Desempenho por empresa</div><div className="divide-y">{data.accounts.map(a => <div key={a.id} className="grid gap-3 p-4 md:grid-cols-[1.5fr_repeat(5,1fr)]"><strong>{a.name}</strong><span className="text-sm">{a.sellers} vendedores</span><span className="text-sm">{a.contacts} leads</span><span className="text-sm">{a.contacts ? Math.round((a.wonDeals / a.contacts) * 100) : 0}% conversão</span><span className="text-sm">{a.wonDeals} vendas</span><strong className="text-sm text-primary">{formatCurrency(a.revenue)}</strong></div>)}</div></div></div>;
}
