"use client";

import { useMemo } from "react";
import type { Deal, PipelineStage } from "@/types";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Trophy,
  XCircle,
  Info,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
}

function computeStageProbability(
  stage: PipelineStage,
  sortedStages: PipelineStage[],
): number {
  const n = sortedStages.length;
  if (n <= 1) return 1;
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  if (index < 0) return 0;
  if (index === n - 1) return 1;
  const slots = n - 1;
  if (slots <= 1) return 0.1;
  const t = index / (slots - 1);
  return 0.1 + t * (0.9 - 0.1);
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const { defaultCurrency } = useAuth();
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const stats = useMemo(() => {
    const active = deals.filter((d) => d.status !== "lost");
    const openDeals = active.filter((d) => d.status !== "won");

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;

    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = stageById.get(d.stage_id);
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (d: Deal) => {
      const ts = d.updated_at ?? d.created_at;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.status === "won" && thisMonth(d),
    ).length;
    const lostThisMonth = deals.filter(
      (d) => d.status === "lost" && thisMonth(d),
    ).length;

    return {
      totalCount,
      totalValue,
      avgValue,
      weightedValue,
      wonThisMonth,
      lostThisMonth,
      conversionRate:
        wonThisMonth + lostThisMonth > 0
          ? Math.round((wonThisMonth / (wonThisMonth + lostThisMonth)) * 100)
          : 0,
    };
  }, [deals, sortedStages]);

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/70 shadow-sm">
        <div className="grid grid-cols-2 gap-px bg-border/70 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Total de vendas"
          value={String(stats.totalCount)}
          tooltip="Conta todas as vendas deste funil que não estão marcadas como perdidas. Vendas ganhas continuam incluídas."
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Valor do funil"
          value={formatCurrency(stats.totalValue, defaultCurrency)}
          tooltip="Soma os valores de todas as vendas deste funil, excluindo as marcadas como perdidas."
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-400" />}
          label="Valor médio"
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip="Valor do funil dividido pelo total de vendas: a média de uma venda não perdida."
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
          label="Valor ponderado"
          value={formatCurrency(stats.weightedValue, defaultCurrency)}
          tooltip="Receita esperada: valor de cada venda aberta multiplicado pela probabilidade da etapa. A primeira etapa fica perto de 10%, as próximas avançam até 90% e ganho vale 100%. Perdidas ficam fora."
        />
        <Metric
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="Ganhos no mês"
          value={String(stats.wonThisMonth)}
          tooltip="Negócios marcados como ganhos desde o primeiro dia do mês atual."
        />
        <Metric
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label="Perdidos no mês"
          value={String(stats.lostThisMonth)}
          tooltip="Negócios marcados como perdidos desde o primeiro dia do mês atual."
        />
        </div>
        <div className="flex flex-col gap-3 border-t border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Prioridade de vendas</p>
              <p className="mt-0.5 text-sm text-foreground">
                {stats.totalCount === 0
                  ? "Adicione o primeiro lead para começar a gerar sinais comerciais."
                  : stats.conversionRate >= 50
                    ? `Conversão de ${stats.conversionRate}% no mês. Priorize as oportunidades mais próximas do fechamento.`
                    : stats.lostThisMonth > stats.wonThisMonth
                      ? "As perdas superam os ganhos neste mês. Revise os leads parados e os motivos de perda."
                      : `Há ${stats.totalCount} oportunidades ativas. Avance primeiro as de maior valor ponderado.`}
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            Conversão mensal <strong className="text-foreground">{stats.conversionRate}%</strong>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Metric({
  icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Como ${label} é calculado`}
                className="ml-auto text-muted-foreground hover:text-foreground focus:outline-none"
              />
            }
          >
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
