import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
} from './types'

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user? automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// O PostgREST entrega no máximo 1.000 linhas por consulta. Sem paginar, os
// números travavam em 1.000 ("1000 vendas abertas") e o gráfico zerava nos
// últimos dias, porque só chegavam as 1.000 mensagens mais antigas do período.
const PAGE_SIZE = 1000
const PARALLEL_PAGES = 6
const MAX_ROWS = 200_000

type PageQuery<T> = (withCount: boolean) => {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>
}

/** Busca todas as linhas de uma consulta, em páginas de 1.000 (as páginas extras em paralelo). */
export async function fetchAllRows<T>(makeQuery: PageQuery<T>): Promise<T[]> {
  const first = await makeQuery(true).range(0, PAGE_SIZE - 1)
  if (first.error) throw first.error
  const rows: T[] = [...(first.data ?? [])]
  const total = Math.min(first.count ?? rows.length, MAX_ROWS)
  if (rows.length < PAGE_SIZE || total <= PAGE_SIZE) return rows

  const starts: number[] = []
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) starts.push(from)
  for (let i = 0; i < starts.length; i += PARALLEL_PAGES) {
    const pages = await Promise.all(
      starts.slice(i, i + PARALLEL_PAGES).map((from) => makeQuery(false).range(from, from + PAGE_SIZE - 1)),
    )
    for (const page of pages) {
      if (page.error) throw page.error
      rows.push(...(page.data ?? []))
    }
  }
  return rows
}

/** Divide uma lista de ids em pedaços para filtros .in() sem estourar o tamanho da URL. */
function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// --- 1. Metric cards ---------------------------------------------------

/**
 * Data de entrada de cada lead que entrou desde `since`. A entrada de um lead é a
 * primeira mensagem que ele mandou (não a data em que um conector o importou); sem
 * mensagem, vale a data de criação do contato. Só busca o que pode ter entrado no
 * período, para não varrer o histórico inteiro de mensagens.
 */
async function loadRecentEntries(db: DB, since: string): Promise<number[]> {
  const sinceTime = new Date(since).getTime()
  const [recentMessages, recentContacts] = await Promise.all([
    fetchAllRows<{ conversation_id: string; created_at: string }>((withCount) =>
      db
        .from('messages')
        .select('conversation_id, created_at', withCount ? { count: 'exact' } : undefined)
        .eq('sender_type', 'customer')
        .gte('created_at', since)
        .order('created_at')
        .order('id'),
    ),
    fetchAllRows<{ id: string; created_at: string }>((withCount) =>
      db.from('contacts').select('id, created_at', withCount ? { count: 'exact' } : undefined).gte('created_at', since).order('id'),
    ),
  ])

  // Conversa → contato, só das conversas com mensagem recente.
  const conversationIds = [...new Set(recentMessages.map((m) => m.conversation_id))]
  const contactOfConversation = new Map<string, string>()
  for (const ids of chunks(conversationIds)) {
    const { data } = await db.from('conversations').select('id, contact_id').in('id', ids)
    for (const row of (data ?? []) as { id: string; contact_id: string | null }[]) {
      if (row.contact_id) contactOfConversation.set(row.id, row.contact_id)
    }
  }

  // Primeira mensagem recente de cada contato.
  const firstRecent = new Map<string, number>()
  for (const m of recentMessages) {
    const contactId = contactOfConversation.get(m.conversation_id)
    const time = new Date(m.created_at).getTime()
    if (!contactId || Number.isNaN(time)) continue
    const current = firstRecent.get(contactId)
    if (current === undefined || time < current) firstRecent.set(contactId, time)
  }

  const candidates = [...new Set([...firstRecent.keys(), ...recentContacts.map((c) => c.id)])]
  if (!candidates.length) return []

  // Data de criação de cada candidato e se ele já tinha mandado mensagem antes do período.
  const createdAt = new Map<string, number>()
  for (const c of recentContacts) createdAt.set(c.id, new Date(c.created_at).getTime())
  const enteredBefore = new Set<string>()
  for (const ids of chunks(candidates)) {
    const missing = ids.filter((id) => !createdAt.has(id))
    if (missing.length) {
      const { data } = await db.from('contacts').select('id, created_at').in('id', missing)
      for (const row of (data ?? []) as { id: string; created_at: string }[]) {
        createdAt.set(row.id, new Date(row.created_at).getTime())
      }
    }
    const { data: convs } = await db.from('conversations').select('id, contact_id').in('contact_id', ids)
    const convRows = (convs ?? []) as { id: string; contact_id: string }[]
    for (const convIds of chunks(convRows.map((c) => c.id))) {
      const { data: older } = await db
        .from('messages')
        .select('conversation_id')
        .eq('sender_type', 'customer')
        .lt('created_at', since)
        .in('conversation_id', convIds)
        .limit(1000)
      const olderConvs = new Set(((older ?? []) as { conversation_id: string }[]).map((m) => m.conversation_id))
      for (const c of convRows) if (olderConvs.has(c.id)) enteredBefore.add(c.contact_id)
    }
  }

  const entries: number[] = []
  for (const id of candidates) {
    if (enteredBefore.has(id)) continue
    const created = createdAt.get(id)
    const first = firstRecent.get(id)
    const entry = Math.min(created ?? Number.POSITIVE_INFINITY, first ?? Number.POSITIVE_INFINITY)
    if (Number.isFinite(entry) && entry >= sinceTime) entries.push(entry)
  }
  return entries
}

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    openDealsRows,
    trackedConversionsToday,
    trackedConversionsYesterday,
    entries,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    fetchAllRows<{ value: number | null }>((withCount) =>
      db.from('deals').select('value', withCount ? { count: 'exact' } : undefined).eq('status', 'open').order('id'),
    ),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .in('conversion_status', ['qualified_lead', 'customer', 'lost'])
      .gte('updated_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .in('conversion_status', ['qualified_lead', 'customer', 'lost'])
      .gte('updated_at', yesterdayStart)
      .lt('updated_at', todayStart),
    loadRecentEntries(db, yesterdayStart),
  ])

  const openDealsValue = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const countEntries = (start: string, end?: string) => {
    const from = new Date(start).getTime()
    const until = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY
    return entries.filter((time) => time >= from && time < until).length
  }

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: countEntries(todayStart),
      previous: countEntries(yesterdayStart, todayStart),
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    trackedConversionsToday: {
      current: trackedConversionsToday.count ?? 0,
      previous: trackedConversionsYesterday.count ?? 0,
    },
  }
}

/** Conversões (Qualificado, Cliente, Desqualificado) registradas no período e no período anterior de mesmo tamanho. */
export async function loadConversionsInRange(
  db: DB,
  start: string,
  end: string,
): Promise<{ current: number; previous: number; sales: number }> {
  const from = new Date(start).getTime()
  const until = new Date(end).getTime()
  const prevStart = new Date(from - (until - from)).toISOString()
  const statuses = ['qualified_lead', 'customer', 'lost']
  const [cur, prev, sales] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).in('conversion_status', statuses).gte('converted_at', start).lt('converted_at', end),
    db.from('contacts').select('id', { count: 'exact', head: true }).in('conversion_status', statuses).gte('converted_at', prevStart).lt('converted_at', start),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('conversion_status', 'customer').gte('converted_at', start).lt('converted_at', end),
  ])
  return { current: cur.count ?? 0, previous: prev.count ?? 0, sales: sales.count ?? 0 }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
  customStart?: string,
  customEnd?: string,
): Promise<ConversationsSeriesPoint[]> {
  const start = customStart ?? daysAgoStart(rangeDays - 1).toISOString()
  const data = await fetchAllRows<{ created_at: string; sender_type: string }>((withCount) => {
    let query = db
      .from('messages')
      .select('created_at, sender_type', withCount ? { count: 'exact' } : undefined)
      .gte('created_at', start)
    if (customEnd) query = query.lt('created_at', customEnd)
    return query.order('created_at', { ascending: true }).order('id')
  })

  const keys = customStart && customEnd
    ? dayKeysFromRange(customStart, customEnd)
    : lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

function dayKeysFromRange(start: string, endExclusive: string): string[] {
  const keys: string[] = []
  const cursor = startOfLocalDay(new Date(start))
  const end = new Date(endExclusive)
  while (cursor < end) {
    keys.push(localDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, deals] = await Promise.all([
    db.from('pipeline_stages').select('id, name, color, pipeline_id, position').order('position'),
    fetchAllRows<{ stage_id: string; value: number | null }>((withCount) =>
      db.from('deals').select('stage_id, value', withCount ? { count: 'exact' } : undefined).eq('status', 'open').order('id'),
    ),
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    // Hide empty stages from the ring (but we'd still show them in the
    // legend if the user? wanted a full breakdown — trimming keeps the
    // visual clean for the common case).
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user? opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const data = await fetchAllRows<{ conversation_id: string; sender_type: string; created_at: string }>((withCount) =>
    db
      .from('messages')
      .select('conversation_id, sender_type, created_at', withCount ? { count: 'exact' } : undefined)
      .gte('created_at', fourteenDaysAgo)
      .order('conversation_id', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id'),
  )

  const rows = data as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Desconhecido'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `Nova mensagem de ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Novo contato: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Venda "${d.title}" em ${stage.name}`
        : `Venda "${d.title}" atualizada`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `enviado para ${b.total_recipients} contatos`
        : `${b.status} (${b.total_recipients} destinatários)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Disparo "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'um contato'
    const autoName = automation?.name || 'Automação'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automação "${autoName}" ${l.status === 'failed' ? 'falhou para' : 'acionada para'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}
