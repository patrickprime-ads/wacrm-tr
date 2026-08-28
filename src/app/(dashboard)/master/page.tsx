"use client";

import { useEffect, useState } from "react";
import { Building2, DollarSign, Loader2, Users, UserRound } from "lucide-react";
import { FeatureAccessDialog } from "@/components/master/feature-access-dialog";
import { formatCurrency } from "@/lib/currency";
import type { FeatureKey, Plan } from "@/lib/features";

type AccountRow = {
  id: string; name: string; sellers: number; contacts: number; conversations: number;
  wonDeals: number; revenue: number; openPipeline: number; plan: Plan;
  enabledFeatures: FeatureKey[]; agentEnabledFeatures: FeatureKey[];
};
type MasterData = { accounts: AccountRow[]; totals: { accounts: number; sellers: number; revenue: number; contacts: number } };

export default function MasterPage() {
  const [data, setData] = useState<MasterData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/master/summary", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setData).catch(caught => setError(caught.message)); }, []);
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">{error}</div>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const cards = [["Empresas", data.totals.accounts, Building2], ["Vendedores", data.totals.sellers, Users], ["Contatos", data.totals.contacts, UserRound], ["Vendas totais", formatCurrency(data.totals.revenue), DollarSign]] as const;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin Master</p><h1 className="text-2xl font-bold">Visão geral das empresas</h1><p className="text-sm text-muted-foreground">Resultados e acessos de todos os clientes.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><strong className="text-xl">{value}</strong></div>)}</div>
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4 font-semibold">Desempenho e acessos por empresa</div>
      <div className="divide-y">{data.accounts.map(account => <div key={account.id} className="grid items-center gap-3 p-4 lg:grid-cols-[1.4fr_repeat(4,0.8fr)_auto]">
        <div><strong className="block">{account.name}</strong><span className="text-xs uppercase text-muted-foreground">Plano {account.plan}</span></div>
        <span className="text-sm">{account.sellers} vendedores</span><span className="text-sm">{account.contacts} leads</span>
        <span className="text-sm">{account.contacts ? Math.round((account.wonDeals / account.contacts) * 100) : 0}% conversão</span>
        <div><span className="block text-sm">{account.wonDeals} vendas</span><strong className="text-sm text-primary">{formatCurrency(account.revenue)}</strong></div>
        <FeatureAccessDialog accountId={account.id} accountName={account.name} plan={account.plan} adminFeatures={account.enabledFeatures} agentFeatures={account.agentEnabledFeatures} onSaved={(enabledFeatures, agentEnabledFeatures) => setData(previous => previous ? { ...previous, accounts: previous.accounts.map(item => item.id === account.id ? { ...item, enabledFeatures, agentEnabledFeatures } : item) } : previous)} />
      </div>)}</div>
    </div>
  </div>;
}
