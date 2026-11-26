"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Target,
} from 'lucide-react'

import {
  loadConversationsSeries,
  loadPeriodMetrics,
  loadPipelineDonut,
  loadResponseTime,
  loadConversionsInRange,
  type PeriodMetrics,
} from '@/lib/dashboard/queries'
import type {
  ConversationsSeriesPoint,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ProductRevenue } from '@/components/dashboard/product-revenue'
import { SalesBySellerMonth } from '@/components/dashboard/sales-by-seller-month'
import { LeadOrigins } from '@/components/dashboard/lead-origins'

type RangeDays = number

function dateInputValue(date: Date) {
  return new Intl.DateTimeFormat('en-CA').format(date)
}

type PeriodWindow = { start: string; end: string; days: number; label: string }

function presetWindow(days: number): PeriodWindow {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)
  const label = days === 1 ? 'hoje' : `nos últimos ${days} dias`
  return { start: start.toISOString(), end: end.toISOString(), days, label }
}

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const [periodMode, setPeriodMode] = useState<'preset' | 'custom'>('preset')
  const [periodStart, setPeriodStart] = useState(() => dateInputValue(new Date(Date.now() - 29 * 86_400_000)))
  const [periodEnd, setPeriodEnd] = useState(() => dateInputValue(new Date()))
  // Um único período manda em todo o Painel: cards, gráfico e funil.
  const [win, setWin] = useState<PeriodWindow>(() => presetWindow(30))
  const range: RangeDays = win.days

  const [metrics, setMetrics] = useState<PeriodMetrics | null>(null)
  const [conversions, setConversions] = useState<{ current: number; previous: number; sales: number } | null>(null)
  const [series, setSeries] = useState<Record<number, ConversationsSeriesPoint[] | null>>({})
  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  useEffect(() => {
    void loadResponseTime(createClient())
      .then(setResponseTime)
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    const db = createClient()
    const isCustom = win.label.includes(' a ')
    Promise.all([
      loadPeriodMetrics(db, win.start, win.end),
      loadConversionsInRange(db, win.start, win.end),
      loadConversationsSeries(db, win.days, isCustom ? win.start : undefined, isCustom ? win.end : undefined),
      loadPipelineDonut(db, win.start, win.end),
    ])
      .then(([m, c, s, p]) => {
        if (cancelled) return
        setMetrics(m)
        setConversions(c)
        setSeries({ [win.days]: s })
        setPipeline(p)
      })
      .catch((err) => console.error('[dashboard] período falhou:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [win])

  const handleRangeChange = useCallback((r: RangeDays) => {
    setPeriodMode('preset')
    setLoading(true)
    setWin(presetWindow(r))
  }, [])

  const applyCustomPeriod = useCallback(() => {
    const start = new Date(`${periodStart}T00:00:00`)
    const end = new Date(`${periodEnd}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return
    end.setDate(end.getDate() + 1)
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
    const label = `de ${start.toLocaleDateString('pt-BR')} a ${new Date(end.getTime() - 1).toLocaleDateString('pt-BR')}`
    setLoading(true)
    setWin({ start: start.toISOString(), end: end.toISOString(), days, label })
  }, [periodStart, periodEnd])

  const presetValue = [1, 7, 30, 90].includes(range) && periodMode === 'preset' ? String(range) : 'custom'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contatos, conversas, vendas e conversões do período escolhido
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start text-sm text-muted-foreground sm:self-auto">
          <span>Período</span>
          <select
            value={presetValue}
            onChange={(event) => {
              if (event.target.value === 'custom') return setPeriodMode('custom')
              setPeriodMode('preset')
              handleRangeChange(Number(event.target.value))
            }}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary"
            aria-label="Selecionar período do painel"
          >
            <option value={1}>Hoje</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value="custom">Personalizado</option>
          </select>
          {periodMode === 'custom' && (
            <>
              <input aria-label="Data inicial" type="date" value={periodStart} max={periodEnd} onChange={(event) => setPeriodStart(event.target.value)} className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground" />
              <input aria-label="Data final" type="date" value={periodEnd} min={periodStart} max={dateInputValue(new Date())} onChange={(event) => setPeriodEnd(event.target.value)} className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground" />
              <button type="button" onClick={applyCustomPeriod} className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Aplicar</button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Conversas no período"
              value={metrics.conversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.conversations.current - metrics.conversations.previous,
                label: deltaLabel(metrics.conversations.current - metrics.conversations.previous, 'vs período anterior'),
              }}
            />
            <MetricCard
              title="Novos leads"
              value={metrics.newLeads.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign: metrics.newLeads.current - metrics.newLeads.previous,
                label: deltaLabel(metrics.newLeads.current - metrics.newLeads.previous, 'vs período anterior'),
              }}
            />
            <MetricCard
              title="Vendido no período"
              value={formatCurrency(metrics.sales.value, defaultCurrency)}
              icon={DollarSign}
              subtitle={`${metrics.sales.count} venda${metrics.sales.count === 1 ? '' : 's'} · ${metrics.openDeals.count} em aberto (${formatCurrency(metrics.openDeals.value, defaultCurrency)})`}
            />
            <MetricCard
              title="Conversões no período"
              value={(conversions?.current ?? 0).toLocaleString()}
              icon={Target}
              delta={{
                sign: (conversions?.current ?? 0) - (conversions?.previous ?? 0),
                label: `${conversions?.sales ?? 0} cliente${conversions?.sales === 1 ? '' : 's'} · ${deltaLabel((conversions?.current ?? 0) - (conversions?.previous ?? 0), 'vs período anterior')}`,
              }}
            />
          </>
        )}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Mostrando {win.label}.</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={loading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={loading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
      <SalesBySellerMonth />
      <LeadOrigins />
      <ProductRevenue />
    </div>
  )
}

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `Sem alteração ${suffix}`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
