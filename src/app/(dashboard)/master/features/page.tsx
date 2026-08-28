"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  DollarSign,
  Loader2,
  Users,
  UserRound,
  Zap,
  Crown,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreateAccountDialog } from "@/components/master/create-account-dialog";
import { FeatureAccessDialog } from "@/components/master/feature-access-dialog";
import { PLAN_FEATURES, type FeatureKey, type Plan } from "@/lib/features";

type AccountRow = {
  id: string;
  name: string;
  sellers: number;
  contacts: number;
  conversations: number;
  wonDeals: number;
  revenue: number;
  openPipeline: number;
  plan?: Plan;
  enabledFeatures: FeatureKey[];
  agentEnabledFeatures: FeatureKey[];
};

type MasterData = {
  accounts: AccountRow[];
  totals: { accounts: number; sellers: number; revenue: number; contacts: number };
};

const PLAN_COLORS: Record<Plan, string> = {
  free: "bg-slate-500/20 text-slate-700 border-slate-500/30",
  pro: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  business: "bg-purple-500/20 text-purple-700 border-purple-500/30",
  enterprise: "bg-amber-500/20 text-amber-700 border-amber-500/30",
};

export default function MasterFeaturesPage() {
  const [data, setData] = useState<MasterData | null>(null);
  const [error, setError] = useState("");
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/master/summary")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const handlePlanChange = async (accountId: string, newPlan: Plan) => {
    setUpdatingPlan(accountId);
    try {
      // Chamando a API do admin master pra mudar o plano da empresa
      const res = await fetch("/api/master/update-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, plan: newPlan, enabledFeatures: PLAN_FEATURES[newPlan] }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao atualizar plano");
      }

      // Atualiza o estado local
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          accounts: prev.accounts.map((a) =>
            a.id === accountId ? { ...a, plan: newPlan, enabledFeatures: PLAN_FEATURES[newPlan] } : a
          ),
        };
      });

      toast.success(`Plano atualizado para ${newPlan.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setUpdatingPlan(null);
    }
  };

  if (error)
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
        {error}
      </div>
    );

  if (!data)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const cards = [
    ["Empresas", data.totals.accounts, Building2],
    ["Vendedores", data.totals.sellers, Users],
    ["Contatos", data.totals.contacts, UserRound],
    ["Vendas totais", formatCurrency(data.totals.revenue), DollarSign],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Admin Master
          </p>
          <h1 className="text-2xl font-bold">Gerenciamento de Planos</h1>
          <p className="text-sm text-muted-foreground">
            Controle de planos e estatísticas de uso por empresa
          </p>
        </div>
        <CreateAccountDialog onSuccess={() => {
          // Reload data when a new account is created
          void fetch("/api/master/summary")
            .then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              return d;
            })
            .then(setData)
            .catch((e) => setError(e.message));
        }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs text-muted-foreground">{label}</p>
            <strong className="text-xl">{value}</strong>
          </div>
        ))}
      </div>

      {/* Tabela de Empresas com Planos */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4 font-semibold">
          Empresas e Planos
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Vendedores</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Taxa Conversão</th>
                <th className="px-4 py-3">Vendas</th>
                <th className="px-4 py-3">Receita</th>
                <th className="px-4 py-3">Plano Atual</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.accounts.map((account) => {
                const conversionRate = account.contacts
                  ? Math.round((account.wonDeals / account.contacts) * 100)
                  : 0;
                const currentPlan = account.plan || "free";
                const isBusy = updatingPlan === account.id;

                return (
                  <tr key={account.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{account.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {account.sellers}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {account.contacts}
                    </td>
                    <td className="flex gap-2 px-4 py-3">
                      <Badge variant="outline">{conversionRate}%</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-primary">
                      {account.wonDeals}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatCurrency(account.revenue)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`capitalize border ${PLAN_COLORS[currentPlan]}`}
                        variant="outline"
                      >
                        {currentPlan === "enterprise" && (
                          <Crown className="h-3 w-3 mr-1" />
                        )}
                        {currentPlan === "business" && (
                          <Zap className="h-3 w-3 mr-1" />
                        )}
                        {currentPlan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={currentPlan}
                        onValueChange={(value) =>
                          handlePlanChange(account.id, value as Plan)
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">FREE</SelectItem>
                          <SelectItem value="pro">PRO</SelectItem>
                          <SelectItem value="business">BUSINESS</SelectItem>
                          <SelectItem value="enterprise">ENTERPRISE</SelectItem>
                        </SelectContent>
                      </Select>
                      <FeatureAccessDialog
                        accountId={account.id}
                        accountName={account.name}
                        plan={currentPlan}
                        adminFeatures={account.enabledFeatures}
                        agentFeatures={account.agentEnabledFeatures}
                        onSaved={(enabledFeatures, agentEnabledFeatures) => setData((previous) => previous ? {
                          ...previous,
                          accounts: previous.accounts.map((item) => item.id === account.id ? { ...item, enabledFeatures, agentEnabledFeatures } : item),
                        } : previous)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda de Planos */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Detalhes dos Planos</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <Badge variant="outline" className={`mb-1 ${PLAN_COLORS.free}`}>
              free
            </Badge>
            <p className="text-muted-foreground">
              Painel, Contatos, Follow-ups
            </p>
          </div>
          <div>
            <Badge variant="outline" className={`mb-1 ${PLAN_COLORS.pro}`}>
              pro
            </Badge>
            <p className="text-muted-foreground">
              + Pipeline, Inbox, Lead Scoring, Relatórios
            </p>
          </div>
          <div>
            <Badge variant="outline" className={`mb-1 ${PLAN_COLORS.business}`}>
              business
            </Badge>
            <p className="text-muted-foreground">
              + Tracking, Agentes IA, Automações
            </p>
          </div>
          <div>
            <Badge variant="outline" className={`mb-1 ${PLAN_COLORS.enterprise}`}>
              <Crown className="h-3 w-3 mr-1" />
              enterprise
            </Badge>
            <p className="text-muted-foreground">
              Tudo + Integrações, Modelos, Fluxos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
