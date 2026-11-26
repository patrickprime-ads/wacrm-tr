"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { useTranslations } from 'next-intl'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Target,
} from 'lucide-react'

import {
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime, loadConversionsInRange } from '@/lib/dashboard/queries'
import type {
  ConversationsSeriesPoint,
  MetricsBundle,
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

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const t = useTranslations('dashboard')
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<number, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)
  const [conversions, setConversions] = useState<{ current: number; previous: number; sales: number } | null>(null)
  const [periodMode, setPeriodMode] = useState<'preset' | 'custom'>('preset')
  const [periodStart, setPeriodStart] = useState(() => dateInputValue(new Date(Date.now() - 29 * 86_400_000)))
  const [periodEnd, setPeriodEnd] = useState(() => dateInputValue(new Date()))

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Card de conversões segue o período escolhido (Hoje, 7, 30, 90 dias ou personalizado).
  const [conversionWindow, setConversionWindow] = useState<{ start: string; end: string } | null>(null)
  useEffect(() => {
    const win = conversionWindow ?? (() => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - (range - 1))
      const end = new Date()
      end.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() + 1)
      return { start: start.toISOString(), end: end.toISOString() }
    })()
    let cancelled = false
    loadConversionsInRange(createClient(), win.start, win.end)
      .then((c) => { if (!cancelled) setConversions(c) })
      .catch((err) => console.error('[dashboard] conversions failed:', err))
    return () => { cancelled = true }
  }, [range, conversionWindow])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setConversionWindow(null)
      setRange(r)
      // "Hoje" (1) não tinha posição no estado inicial: undefined !== null fazia a busca
      // ser pulada e o gráfico ficava travado. Só pula quando já há dados carregados.
      if (Array.isArray(series[r])) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const applyCustomPeriod = useCallback(() => {
    const start = new Date(`${periodStart}T00:00:00`)
    const end = new Date(`${periodEnd}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return
    end.setDate(end.getDate() + 1)
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
    setConversionWindow({ start: start.toISOString(), end: end.toISOString() })
    setRange(days)
    setSeriesLoading(true)
    void loadConversationsSeries(createClient(), days, start.toISOString(), end.toISOString())
      .then((data) => setSeries((previous) => ({ ...previous, [days]: data })))
      .catch((err) => console.error('[dashboard] custom series failed:', err))
      .finally(() => setSeriesLoading(false))
  }, [periodStart, periodEnd])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start text-sm text-muted-foreground sm:self-auto">
          <span>Período</span>
          <select
            value={periodMode === 'custom' ? 'custom' : String(range)}
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
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('active_conversations')}
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(metrics.activeConversations.previous, t('new_today_vs_yesterday')),
              }}
            />
            <MetricCard
              title={t('new_contacts_today')}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign: metrics.newContactsToday.current - metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                  t('vs_yesterday'),
                ),
              }}
            />
            <MetricCard
              title={t('open_deals_value')}
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              subtitle={`${metrics.openDealsCount} ${t('open_deals')}`}
            />
            <MetricCard
              title={range === 1 && !conversionWindow ? 'Conversões hoje' : 'Conversões no período'}
              value={(conversions?.current ?? metrics.trackedConversionsToday.current).toLocaleString()}
              icon={Target}
              delta={{
                sign: (conversions?.current ?? 0) - (conversions?.previous ?? 0),
                label: conversions
                  ? `${conversions.sales} venda${conversions.sales === 1 ? '' : 's'} · ${deltaLabel(conversions.current - conversions.previous, 'vs período anterior')}`
                  : deltaLabel(
                      metrics.trackedConversionsToday.current - metrics.trackedConversionsToday.previous,
                      t('vs_yesterday'),
                    ),
              }}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
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
