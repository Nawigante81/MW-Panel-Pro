import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle,
  ClipboardList,
  ExternalLink,
  Eye,
  FileBadge,
  Home,
  Inbox,
  Info,
  KanbanSquare,
  Plus,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import MarketOffersCompactWidget from './dashboard/MarketOffersCompactWidget'
import MarketOpportunitiesWidget from './dashboard/MarketOpportunitiesWidget'
import MarketAlertsWidget from './dashboard/MarketAlertsWidget'
import MarketHeatmapWidget from './dashboard/MarketHeatmapWidget'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'
import { apiFetch } from '../utils/apiClient'
import { getRoleScopedPreference, setRoleScopedPreference } from '../utils/viewPreferences'
import { formatMoney, formatPricePerM2, formatRelativeTime, normalizeOfferStatus } from '../utils/dashboardFormatters'
import { metricEmpty, metricNotConfigured, metricValue, type MetricState } from '../modules/dashboard/lib/dashboard-metric-state'

type MetricApiStatus = 'OK' | 'EMPTY' | 'NOT_CONFIGURED' | 'ERROR'

type ListingStats = {
  totalOffers: number
  activeOffers: number
  inactiveOffers: number
  soldOffers: number
  expiredOffers: number
  expiringOffers: number
  portfolioValue: number
  avgPricePerM2: number
  documentsRequiringAction?: number
  lastUpdatedAt?: string
  metricStatuses?: {
    portfolioValue?: MetricApiStatus
    avgPricePerM2?: MetricApiStatus
    newInquiries?: MetricApiStatus
    trend?: MetricApiStatus
  }
}

type AttentionItem = { id: string; title: string; reason: string; href: string }

type DashboardExceptions = {
  offersNeedingAttentionCount: number
  offersNeedingAttention: Array<{ listingId: string; title: string; reasonLabel: string; target: string }>
  documentsRequiringAction: number
  lastUpdatedAt?: string
}

type DashboardLeadFollowups = {
  total: number
  overdueCount: number
  todayCount: number
  upcomingCount: number
  horizonDays: number
  escalationThresholdDays?: number
  escalationEligibleCount?: number
  escalationNotificationsCreated?: number
  items: Array<{
    leadId: string
    name: string
    status: string
    source?: string
    followUpDate: string
    assignedAgentId?: string | null
    clientId?: string | null
    bucket: 'overdue' | 'today' | 'upcoming'
    daysOverdue: number
    target: string
  }>
  lastUpdatedAt?: string
}

type ActivityViewModel = {
  id: string
  title: string
  subtitle: string
  time: string
  icon: typeof Activity
  toneClass: string
  link?: string
}

const DEFAULT_LISTING_STATS: ListingStats = {
  totalOffers: 0,
  activeOffers: 0,
  inactiveOffers: 0,
  soldOffers: 0,
  expiredOffers: 0,
  expiringOffers: 0,
  portfolioValue: 0,
  avgPricePerM2: 0,
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-main)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]'

const hasPartialImport = (listing: any) => {
  const tags = Array.isArray(listing?.tags) ? listing.tags : []
  const publicationStatus = listing?.publicationStatus && typeof listing.publicationStatus === 'object' ? listing.publicationStatus : {}
  const importMeta = publicationStatus.importMeta && typeof publicationStatus.importMeta === 'object' ? publicationStatus.importMeta : null
  return tags.includes('partial_import') || Boolean(importMeta?.isPartial)
}

const Dashboard = () => {
  const { clients, properties, documents, activities, tasks, listings, leads, loading } = useDataStore()
  const { profile, user, agency } = useAuthStore()
  const role = user?.role || 'agent'

  const [marketRows, setMarketRows] = useState<any[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [showViewSettings, setShowViewSettings] = useState(false)
  const [listingStatsLoading, setListingStatsLoading] = useState(false)
  const [listingStats, setListingStats] = useState<ListingStats>(DEFAULT_LISTING_STATS)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [listingStatsError, setListingStatsError] = useState(false)
  const [showAttentionList, setShowAttentionList] = useState(false)
  const [dashboardExceptions, setDashboardExceptions] = useState<DashboardExceptions | null>(null)
  const [leadFollowups, setLeadFollowups] = useState<DashboardLeadFollowups | null>(null)
  const [showLeadFollowupsList, setShowLeadFollowupsList] = useState(false)

  const defaultWidgetsByRole: Record<string, string[]> = {
    agent: ['myDay', 'kpi', 'stats', 'tasks', 'activities', 'quickActions', 'marketOffers'],
    manager: ['myDay', 'kpi', 'stats', 'tasks', 'activities', 'quickActions', 'marketOffers', 'marketIntel', 'marketWidgets'],
    admin: ['myDay', 'kpi', 'stats', 'tasks', 'activities', 'quickActions', 'marketOffers', 'marketIntel', 'marketWidgets'],
  }

  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() =>
    getRoleScopedPreference<string[]>(role, 'dashboard.visibleWidgets', defaultWidgetsByRole[role] || defaultWidgetsByRole.agent)
  )

  const [dashboardDensity, setDashboardDensity] = useState<'compact' | 'comfortable'>(() =>
    getRoleScopedPreference<'compact' | 'comfortable'>(role, 'dashboard.density', 'comfortable')
  )

  useEffect(() => {
    setVisibleWidgets(getRoleScopedPreference<string[]>(role, 'dashboard.visibleWidgets', defaultWidgetsByRole[role] || defaultWidgetsByRole.agent))
    setDashboardDensity(getRoleScopedPreference<'compact' | 'comfortable'>(role, 'dashboard.density', 'comfortable'))
  }, [role])

  useEffect(() => {
    setRoleScopedPreference(role, 'dashboard.visibleWidgets', visibleWidgets)
  }, [role, visibleWidgets])

  useEffect(() => {
    setRoleScopedPreference(role, 'dashboard.density', dashboardDensity)
  }, [role, dashboardDensity])

  const hasWidget = (key: string) => visibleWidgets.includes(key)
  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  const fetchDashboardData = async () => {
    setMarketLoading(true)
    setListingStatsLoading(true)
    setListingStatsError(false)
    try {
      const assignedOnly = role === 'agent' ? 1 : 0
      const [rows, stats, exceptions, followups] = await Promise.all([
        apiFetch<any[]>('/external-listings?onlyActive=1').catch(() => []),
        apiFetch<ListingStats>('/dashboard/listing-stats').catch(() => null as any),
        apiFetch<DashboardExceptions>('/dashboard/exceptions').catch(() => null as any),
        apiFetch<DashboardLeadFollowups>(`/dashboard/lead-followups?horizonDays=7&limit=10&assignedOnly=${assignedOnly}`).catch(() => null as any),
      ])
      setMarketRows(Array.isArray(rows) ? rows : [])
      if (stats) {
        setListingStats({
          totalOffers: Number(stats?.totalOffers || 0),
          activeOffers: Number(stats?.activeOffers || 0),
          inactiveOffers: Number(stats?.inactiveOffers || 0),
          soldOffers: Number(stats?.soldOffers || 0),
          expiredOffers: Number(stats?.expiredOffers || 0),
          expiringOffers: Number(stats?.expiringOffers || 0),
          portfolioValue: Number(stats?.portfolioValue || 0),
          avgPricePerM2: Number(stats?.avgPricePerM2 || 0),
          documentsRequiringAction: Number(stats?.documentsRequiringAction || 0),
          lastUpdatedAt: stats?.lastUpdatedAt,
          metricStatuses: stats?.metricStatuses || {},
        })
      } else {
        setListingStatsError(true)
        setListingStats(DEFAULT_LISTING_STATS)
      }

      if (exceptions) {
        setDashboardExceptions(exceptions)
      }

      if (followups) {
        setLeadFollowups(followups)
      }

      setLastUpdatedAt(stats?.lastUpdatedAt || exceptions?.lastUpdatedAt || followups?.lastUpdatedAt || new Date().toISOString())
    } finally {
      setMarketLoading(false)
      setListingStatsLoading(false)
    }
  }

  useEffect(() => {
    void fetchDashboardData()
  }, [agency?.id, user?.agencyId, role])

  const widgetOptions = [
    { key: 'myDay', label: 'Mój dzień (triage)' },
    { key: 'kpi', label: 'KPI overview' },
    { key: 'stats', label: 'KPI operacyjne' },
    { key: 'tasks', label: 'Nadchodzące zadania' },
    { key: 'activities', label: 'Ostatnie aktywności' },
    { key: 'quickActions', label: 'Szybkie akcje' },
    { key: 'marketOffers', label: 'Monitoring rynku (kompakt)' },
    { key: 'marketIntel', label: 'Inteligencja rynku + trend' },
    { key: 'marketWidgets', label: 'Widżety rynku (okazje/alerty/heatmapa)' },
  ]

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>()
    clients.forEach((c) => {
      const full = `${(c as any).firstName || ''} ${(c as any).lastName || ''}`.trim()
      map.set(c.id, full || (c as any).email || 'Klient')
    })
    return map
  }, [clients])

  const propertyById = useMemo(() => {
    const map = new Map<string, any>()
    properties.forEach((p) => map.set(p.id, p))
    return map
  }, [properties])

  const normalizedListingBuckets = useMemo(() => {
    const buckets = { draft: 0, active: 0, archived: 0, expired: 0 }
    for (const listing of listings) {
      const normalized = normalizeOfferStatus(String((listing as any).status || ''))
      buckets[normalized] += 1
    }
    return buckets
  }, [listings])

  const listingDerivedMetrics = useMemo(() => {
    const pricedRows = listings
      .map((listing) => {
        const property = (listing as any).property || propertyById.get((listing as any).propertyId)
        const area = Number(property?.area || property?.areaM2 || 0)
        const price = Number((listing as any).price || property?.price || 0)
        return { area, price }
      })
      .filter((x) => x.area > 0 && x.price > 0)

    const avgPricePerM2 = pricedRows.length
      ? pricedRows.reduce((acc, item) => acc + item.price / item.area, 0) / pricedRows.length
      : null

    const portfolio = listings
      .map((l) => Number((l as any).price || 0))
      .filter((n) => Number.isFinite(n) && n > 0)
      .reduce((acc, n) => acc + n, 0)

    return { avgPricePerM2, portfolioValue: portfolio }
  }, [listings, propertyById])

  const effectiveStats = useMemo(() => {
    const totalOffers = Math.max(Number(listingStats.totalOffers || 0), listings.length)
    const activeOffers = Number(listingStats.activeOffers || 0) > 0 ? Number(listingStats.activeOffers || 0) : normalizedListingBuckets.active
    const inactiveOffers = Number(listingStats.inactiveOffers || 0) > 0
      ? Number(listingStats.inactiveOffers || 0)
      : normalizedListingBuckets.draft + normalizedListingBuckets.archived

    return {
      totalOffers,
      activeOffers,
      inactiveOffers,
      soldOffers: Number(listingStats.soldOffers || 0),
      expiredOffers: Number(listingStats.expiredOffers || 0),
      expiringOffers: Number(listingStats.expiringOffers || 0),
      portfolioValue: Number(listingStats.portfolioValue || 0) > 0 ? Number(listingStats.portfolioValue || 0) : listingDerivedMetrics.portfolioValue,
      avgPricePerM2: Number(listingStats.avgPricePerM2 || 0) > 0 ? Number(listingStats.avgPricePerM2 || 0) : listingDerivedMetrics.avgPricePerM2,
    }
  }, [listingStats, listings.length, normalizedListingBuckets, listingDerivedMetrics])

  const todayTasksCount = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    return tasks.filter((t) => {
      const task: any = t
      if (task.status === 'completed' || task.status === 'cancelled') return false

      const dueTs = task.dueDate ? new Date(task.dueDate).getTime() : NaN
      if (Number.isFinite(dueTs)) {
        return dueTs >= start.getTime() && dueTs <= end.getTime()
      }

      const createdTs = task.createdAt ? new Date(task.createdAt).getTime() : NaN
      return Number.isFinite(createdTs) && createdTs >= start.getTime() && createdTs <= end.getTime()
    }).length
  }, [tasks])

  const newInquiriesCount = useMemo(() => {
    const fromActivities = activities.filter((a) => String((a as any).type || '').toLowerCase().includes('lead_created')).length
    if (fromActivities > 0) return fromActivities
    return leads.filter((lead) => String((lead as any).status || '').toLowerCase() === 'new').length
  }, [activities, leads])

  const documentsRequiringAction = dashboardExceptions?.documentsRequiringAction
    ?? documents.filter((d) => ['draft', 'sent'].includes(String((d as any).status || '').toLowerCase())).length

  const listingsAttentionItems = useMemo<AttentionItem[]>(() => {
    if (dashboardExceptions?.offersNeedingAttention?.length) {
      return dashboardExceptions.offersNeedingAttention.map((item) => ({
        id: item.listingId,
        title: item.title,
        reason: item.reasonLabel,
        href: item.target || '/nieruchomosci?filter=needs_attention',
      }))
    }

    const now = Date.now()
    const withReason: AttentionItem[] = []

    for (const listing of listings) {
      const l: any = listing
      const title = l.property?.title || propertyById.get(l.propertyId)?.title || l.listingNumber || 'Oferta'
      const publicationStatuses = Object.values(l.publicationStatus || {}) as Array<{ status?: string }>
      const hasPublishError = publicationStatuses.some((ps) => String(ps?.status || '').toLowerCase().includes('error') || String(ps?.status || '').toLowerCase().includes('failed'))
      const publishedAt = l.publishedAt ? new Date(l.publishedAt).getTime() : NaN
      const hasImages = Array.isArray(l.property?.media) ? l.property.media.length > 0 : true

      if (hasPublishError) withReason.push({ id: l.id, title, reason: 'Błąd publikacji', href: '/nieruchomosci?filter=needs_attention' })
      else if (!Number(l.price || 0)) withReason.push({ id: l.id, title, reason: 'Brak ceny', href: '/nieruchomosci?filter=needs_attention' })
      else if (!hasImages) withReason.push({ id: l.id, title, reason: 'Brak zdjęć', href: '/nieruchomosci?filter=needs_attention' })
      else if (normalizeOfferStatus(String(l.status || '')) !== 'active') withReason.push({ id: l.id, title, reason: 'Draft / nieopublikowana', href: '/nieruchomosci?filter=needs_attention' })
      else if (Number.isFinite(publishedAt) && publishedAt <= now - 45 * 24 * 60 * 60 * 1000) withReason.push({ id: l.id, title, reason: 'Wygasa publikacja', href: '/nieruchomosci?filter=expiring' })
    }

    return withReason.slice(0, 5)
  }, [dashboardExceptions, listings, propertyById])

  const partialImportListingsCount = useMemo(() => listings.filter((listing) => hasPartialImport(listing)).length, [listings])

  const offersNeedingAttentionCount = dashboardExceptions?.offersNeedingAttentionCount ?? listingsAttentionItems.length
  const leadFollowupsOverdueCount = Number(leadFollowups?.overdueCount || 0)
  const leadFollowupsTodayCount = Number(leadFollowups?.todayCount || 0)
  const leadEscalationEligibleCount = Number(leadFollowups?.escalationEligibleCount || 0)
  const leadEscalationThresholdDays = Number(leadFollowups?.escalationThresholdDays || 0)
  const leadFollowupsItems = (leadFollowups?.items || []).slice(0, 5)

  const marketIntelligence = useMemo(() => {
    const now = Date.now()
    const priced = marketRows.filter((x) => Number(x.price || 0) > 0 && Number(x.areaM2 || 0) > 0)
    const ppm2 = priced.map((x) => Number(x.price) / Number(x.areaM2))
    const avg = ppm2.length ? ppm2.reduce((a, b) => a + b, 0) / ppm2.length : null

    const since24 = now - 24 * 60 * 60 * 1000
    const new24h = marketRows.filter((x) => new Date(x.firstSeenAt || 0).getTime() >= since24).length

    return { avgPriceM2: avg, new24h }
  }, [marketRows])

  const trend = useMemo(() => {
    const now = Date.now()
    const points: Array<{ day: string; value: number }> = []
    for (let i = 29; i >= 0; i--) {
      const start = new Date(now - i * 24 * 60 * 60 * 1000)
      start.setUTCHours(0, 0, 0, 0)
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      const rows = marketRows.filter((r) => {
        const ts = new Date(r.firstSeenAt || 0).getTime()
        return ts >= start.getTime() && ts < end.getTime() && Number(r.areaM2 || 0) > 0 && Number(r.price || 0) > 0
      })
      const avg = rows.length ? rows.reduce((acc, r) => acc + Number(r.price) / Number(r.areaM2), 0) / rows.length : 0
      points.push({ day: `${start.getUTCDate()}`.padStart(2, '0'), value: Math.round(avg) })
    }
    return points
  }, [marketRows])

  const recentActivities = useMemo<ActivityViewModel[]>(() => {
    return [...activities]
      .sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime())
      .slice(0, 8)
      .map((a) => {
        const typeRaw = String((a as any).type || '').toLowerCase()
        const entityType = String((a as any).entityType || '').toLowerCase()
        const description = String((a as any).description || '')
        const titleBase = (a as any).entityName || description || 'Aktywność'
        if (typeRaw.includes('lead_created') || entityType === 'lead') return { id: (a as any).id, title: `Nowe zapytanie: ${titleBase}`, subtitle: description || 'Lead', time: formatRelativeTime((a as any).createdAt), icon: Inbox, toneClass: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25', link: '/leads?filter=new' }
        if (entityType === 'task' || typeRaw.includes('task')) return { id: (a as any).id, title: `Aktualizacja zadania: ${titleBase}`, subtitle: description || 'Zadanie', time: formatRelativeTime((a as any).createdAt), icon: ClipboardList, toneClass: 'text-orange-300 bg-orange-500/10 border-orange-500/25', link: '/zadania' }
        if (entityType === 'document' || typeRaw.includes('document')) return { id: (a as any).id, title: `Dokument: ${titleBase}`, subtitle: description || 'Dokument', time: formatRelativeTime((a as any).createdAt), icon: FileBadge, toneClass: 'text-violet-300 bg-violet-500/10 border-violet-500/25', link: '/dokumenty' }
        if (typeRaw.includes('listing_created')) return { id: (a as any).id, title: `Nowa oferta: ${titleBase}`, subtitle: description || 'Oferta', time: formatRelativeTime((a as any).createdAt), icon: Home, toneClass: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25', link: '/nieruchomosci' }
        return { id: (a as any).id, title: titleBase, subtitle: description || 'Zmiana w CRM', time: formatRelativeTime((a as any).createdAt), icon: Activity, toneClass: 'text-slate-200 bg-slate-500/10 border-slate-400/30' }
      })
  }, [activities])

  const upcomingTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => (t as any).status !== 'completed' && (t as any).status !== 'cancelled')
      .sort((a, b) => new Date((a as any).dueDate || (a as any).createdAt || 0).getTime() - new Date((b as any).dueDate || (b as any).createdAt || 0).getTime())
      .slice(0, 6)
      .map((t) => ({
        id: (t as any).id,
        title: (t as any).title,
        client: ((t as any).clientId ? clientNameById.get((t as any).clientId) : undefined) || (t as any).description || 'CRM',
        date: (t as any).dueDate || (t as any).createdAt || new Date().toISOString(),
        priority: String((t as any).priority || 'low'),
      }))
  }, [tasks, clientNameById])

  const metricStatuses = listingStats.metricStatuses || {}

  const portfolioMetric: MetricState = listingStatsLoading
    ? { kind: 'loading' }
    : metricStatuses.portfolioValue === 'ERROR'
      ? { kind: 'error', message: 'Błąd pobierania metryki' }
      : metricStatuses.portfolioValue === 'EMPTY'
        ? metricEmpty('Brak aktywnych ofert')
        : effectiveStats.portfolioValue > 0
          ? metricValue(effectiveStats.portfolioValue, { formatted: formatMoney(effectiveStats.portfolioValue), hint: 'Suma aktualnych cen ofert w CRM' })
          : metricEmpty('Brak aktywnych ofert')

  const avgPriceMetric: MetricState = listingStatsLoading
    ? { kind: 'loading' }
    : metricStatuses.avgPricePerM2 === 'ERROR'
      ? { kind: 'error', message: 'Błąd pobierania metryki' }
      : metricStatuses.avgPricePerM2 === 'EMPTY'
        ? metricEmpty('Brak danych do wyliczenia')
        : effectiveStats.avgPricePerM2 && effectiveStats.avgPricePerM2 > 0
          ? metricValue(effectiveStats.avgPricePerM2, { formatted: formatPricePerM2(effectiveStats.avgPricePerM2), hint: 'Wyliczone z ofert z ceną i metrażem' })
          : metricEmpty('Brak danych do wyliczenia')

  const leadsMetric: MetricState = loading
    ? { kind: 'loading' }
    : metricStatuses.newInquiries === 'ERROR'
      ? { kind: 'error', message: 'Błąd pobierania źródła leadów' }
      : metricStatuses.newInquiries === 'NOT_CONFIGURED'
        ? metricNotConfigured('Brak źródła danych')
        : metricStatuses.newInquiries === 'EMPTY'
          ? metricEmpty('Brak nowych zapytań')
          : metricValue(newInquiriesCount)

  const renderMetric = (metric: MetricState) => {
    if (metric.kind === 'loading') return <p className="text-xl font-semibold text-[#e5e7eb]">...</p>
    if (metric.kind === 'value') return <p className="text-xl font-semibold text-[#e5e7eb]">{metric.formatted ?? metric.value}</p>
    return <p className="text-sm font-medium text-[#cbd5e1]">{metric.message}</p>
  }

  return (
    <div className={`${dashboardDensity === 'compact' ? 'space-y-3 md:space-y-4' : 'space-y-4 md:space-y-5'} bg-[var(--bg-main)] p-0 md:p-5 rounded-none md:rounded-xl border-0 md:border md:border-[var(--border-subtle)]`}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-[#2b3a57] bg-[#111827] text-[11px] text-[#b6c2d3] mb-2">
            <Sparkles size={12} className="text-[var(--accent-main)]" />
            Dashboard operacyjny CRM
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#f1f5f9]">Dzień dobry, {profile?.firstName || 'Zespole'} 👋</h1>
          <p className="text-[#b6c2d3] text-sm mt-1">Skup się na triage: zadania, leady, wyjątki i kolejne akcje.</p>
          <p className="text-xs text-[#94a3b8] mt-1">Dane zaktualizowano: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void fetchDashboardData()} className={`inline-flex items-center gap-2 bg-[#111a2b] text-[#e5e7eb] border border-[#2b3a57] px-3 py-2 rounded-md hover:bg-[#16243d] text-sm ${FOCUS_RING}`}>
            <RefreshCw size={14} /> Odśwież
          </button>
          <button onClick={() => setShowViewSettings((v) => !v)} className={`inline-flex items-center gap-2 bg-[#111a2b] text-[#e5e7eb] border border-[#2b3a57] px-3 py-2 rounded-md hover:bg-[#16243d] text-sm ${FOCUS_RING}`}>
            <SlidersHorizontal size={14} /> Dostosuj widok
          </button>
          <Link to="/nieruchomosci" className={`btn-primary inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm ${FOCUS_RING}`}><Plus size={14} /> + Nowa oferta</Link>
        </div>
      </div>

      {showViewSettings && (
        <div className="rounded-xl border border-[#2b3a57] bg-[#101827] p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-[#d2dceb]">Preset roli: <span className="font-semibold">{role}</span>. Wybierz moduły i gęstość.</p>
            <div className="inline-flex rounded-lg overflow-hidden border border-[#2b3a57]">
              <button onClick={() => setDashboardDensity('compact')} className={`px-3 py-1.5 text-xs ${dashboardDensity === 'compact' ? 'bg-[var(--accent-main)] text-black' : 'bg-[#0f172a] text-[#cbd5e1]'}`}>Compact</button>
              <button onClick={() => setDashboardDensity('comfortable')} className={`px-3 py-1.5 text-xs ${dashboardDensity === 'comfortable' ? 'bg-[var(--accent-main)] text-black' : 'bg-[#0f172a] text-[#cbd5e1]'}`}>Comfortable</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {widgetOptions.map((opt) => (
              <label key={opt.key} className="inline-flex items-center gap-2 text-xs text-[#d2dceb]">
                <input type="checkbox" checked={hasWidget(opt.key)} onChange={() => toggleWidget(opt.key)} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {hasWidget('myDay') && (
        <section className="rounded-xl border border-[#2b3a57] bg-[#101827] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#f1f5f9]">Mój dzień</h2>
            <span className="text-xs text-[#9fb0c5]">Triage i szybkie decyzje</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5">
            <Link to="/zadania?filter=today" className={`rounded-lg border border-[#2b3a57] bg-[#0f172a] p-3 hover:border-cyan-400/40 ${FOCUS_RING}`}>
              <p className="text-xs text-[#9fb0c5]">Zadania dziś</p>
              <p className="text-xl font-semibold text-[#f1f5f9]">{todayTasksCount}</p>
              <p className="text-xs text-[#cbd5e1]">{todayTasksCount === 0 ? 'Brak zadań na dziś' : 'Przejdź do listy dziennej'}</p>
            </Link>

            <Link to="/leads?filter=new" className={`rounded-lg border border-[#2b3a57] bg-[#0f172a] p-3 hover:border-fuchsia-400/40 ${FOCUS_RING}`}>
              <p className="text-xs text-[#9fb0c5]">Nowe zapytania</p>
              <p className="text-xl font-semibold text-[#f1f5f9]">{newInquiriesCount}</p>
              <p className="text-xs text-[#cbd5e1]">{newInquiriesCount === 0 ? 'Brak nowych zapytań' : 'Otwórz leady do obsługi'}</p>
            </Link>

            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-3">
              <button onClick={() => setShowLeadFollowupsList((v) => !v)} className={`w-full text-left hover:text-white ${FOCUS_RING}`}>
                <p className="text-xs text-[#9fb0c5]">Follow-up leadów</p>
                <p className="text-xl font-semibold text-[#f1f5f9]">{leadFollowupsOverdueCount + leadFollowupsTodayCount}</p>
                <p className="text-xs text-[#cbd5e1]">
                  {leadFollowupsOverdueCount > 0
                    ? `${leadFollowupsOverdueCount} przeterminowanych`
                    : leadFollowupsTodayCount > 0
                      ? `${leadFollowupsTodayCount} na dziś`
                      : 'Brak follow-upów na dziś'}
                </p>
                {leadEscalationEligibleCount > 0 && (
                  <p className="text-[11px] text-red-300 mt-1">
                    SLA: {leadEscalationEligibleCount} pozycji {'>='} {leadEscalationThresholdDays} d
                  </p>
                )}
              </button>
              {showLeadFollowupsList && (
                <div className="mt-2 space-y-1.5">
                  {leadFollowupsItems.length === 0 ? <p className="text-xs text-[#9fb0c5]">Brak leadów do follow-upu.</p> : leadFollowupsItems.map((item) => (
                    <Link key={item.leadId} to={item.target} className={`block rounded-md border border-[#304262] px-2 py-1.5 hover:bg-[#16243d] ${FOCUS_RING}`}>
                      <p className="text-xs text-[#e2e8f0] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#fda4af]">
                        {item.bucket === 'overdue'
                          ? `Przeterminowane o ${item.daysOverdue} d`
                          : item.bucket === 'today'
                            ? 'Na dziś'
                            : `Termin: ${new Date(item.followUpDate).toLocaleDateString('pl-PL')}`}
                      </p>
                    </Link>
                  ))}
                  <Link to="/leads?filter=follow_up" className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200">Zobacz wszystkie <ArrowRight size={12} /></Link>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-3">
              <button onClick={() => setShowAttentionList((v) => !v)} className={`w-full text-left hover:text-white ${FOCUS_RING}`}>
                <p className="text-xs text-[#9fb0c5]">Oferty wymagające uwagi</p>
                <p className="text-xl font-semibold text-[#f1f5f9]">{offersNeedingAttentionCount}</p>
                <p className="text-xs text-[#cbd5e1]">{offersNeedingAttentionCount === 0 ? 'Brak wyjątków' : 'Pokaż listę i powody'}</p>
              </button>
              <Link to="/nieruchomosci?import=partial" className={`mt-2 inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 ${FOCUS_RING}`}>
                Oferty z danymi częściowymi: {partialImportListingsCount} <ArrowRight size={12} />
              </Link>
              {showAttentionList && (
                <div className="mt-2 space-y-1.5">
                  {listingsAttentionItems.length === 0 ? <p className="text-xs text-[#9fb0c5]">Brak pozycji wymagających reakcji.</p> : listingsAttentionItems.map((item) => (
                    <Link key={item.id} to={item.href} className={`block rounded-md border border-[#304262] px-2 py-1.5 hover:bg-[#16243d] ${FOCUS_RING}`}>
                      <p className="text-xs text-[#e2e8f0] truncate">{item.title}</p>
                      <p className="text-[11px] text-[#fda4af]">{item.reason}</p>
                    </Link>
                  ))}
                  <Link to="/nieruchomosci?filter=needs_attention" className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">Zobacz wszystkie <ArrowRight size={12} /></Link>
                </div>
              )}
            </div>

            <Link to="/dokumenty?status=pending_action" className={`rounded-lg border border-[#2b3a57] bg-[#0f172a] p-3 hover:border-violet-400/40 ${FOCUS_RING}`}>
              <p className="text-xs text-[#9fb0c5]">Dokumenty do działania</p>
              <p className="text-xl font-semibold text-[#f1f5f9]">{documentsRequiringAction}</p>
              <p className="text-xs text-[#cbd5e1]">{documentsRequiringAction === 0 ? 'Brak dokumentów do akcji' : 'Podpisz / wyślij / domknij'}</p>
            </Link>
          </div>
        </section>
      )}

      {hasWidget('kpi') && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Link to="/nieruchomosci" className={`rounded-xl border border-[#2b3a57] bg-[#111a2b] p-4 hover:border-cyan-400/40 ${FOCUS_RING}`}>
            <p className="text-[11px] text-[#9fb0c5]">Wartość portfela</p>
            {renderMetric(portfolioMetric)}
            <p className="text-xs text-[#9fb0c5] mt-1">{portfolioMetric.kind === 'value' ? portfolioMetric.hint : portfolioMetric.kind === 'empty' ? portfolioMetric.message : 'Ładowanie danych'}</p>
          </Link>

          <Link to="/nieruchomosci?status=active" className={`rounded-xl border border-[#2b3a57] bg-[#111a2b] p-4 hover:border-emerald-400/40 ${FOCUS_RING}`}>
            <p className="text-[11px] text-[#9fb0c5]">Aktywne oferty</p>
            <p className="text-xl font-semibold text-[#f1f5f9]">{listingStatsLoading ? '...' : effectiveStats.activeOffers}</p>
            <p className="text-xs text-[#9fb0c5] mt-1">Oferty aktywne i gotowe do obsługi</p>
          </Link>

          <Link to="/leads?filter=new" className={`rounded-xl border border-[#2b3a57] bg-[#111a2b] p-4 hover:border-fuchsia-400/40 ${FOCUS_RING}`}>
            <p className="text-[11px] text-[#9fb0c5]">Nowe leady / zapytania</p>
            {renderMetric(leadsMetric)}
            <p className="text-xs text-[#9fb0c5] mt-1">{leadsMetric.kind === 'not_configured' ? leadsMetric.message : 'Kanały leadowe i aktywności CRM'}</p>
          </Link>

          <Link to="/zadania?filter=today" className={`rounded-xl border border-[#2b3a57] bg-[#111a2b] p-4 hover:border-amber-400/40 ${FOCUS_RING}`}>
            <p className="text-[11px] text-[#9fb0c5]">Zadania dziś</p>
            <p className="text-xl font-semibold text-[#f1f5f9]">{todayTasksCount}</p>
            <p className="text-xs text-[#9fb0c5] mt-1">Priorytet bieżącego dnia operacyjnego</p>
          </Link>
        </section>
      )}

      {hasWidget('stats') && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Wszystkie oferty', value: effectiveStats.totalOffers, to: '/nieruchomosci', helper: 'Pełny portfel ofert' },
            { label: 'Oferty wygasające', value: effectiveStats.expiringOffers, to: '/nieruchomosci?filter=expiring', helper: 'Publikacje do odświeżenia' },
            { label: 'Oferty z danymi częściowymi', value: partialImportListingsCount, to: '/nieruchomosci?import=partial', helper: 'Importy wymagające uzupełnienia' },
            { label: 'Klienci', value: clients.length, to: '/klienci', helper: 'Baza aktywnych klientów' },
            { label: 'Drafty do publikacji', value: normalizedListingBuckets.draft, to: '/nieruchomosci?filter=draft', helper: 'Oferty nieopublikowane' },
          ].map((stat) => (
            <Link key={stat.label} to={stat.to} className={`card p-3.5 rounded-xl border border-[#2b3a57] bg-[#101827] hover:border-[#46649a] ${FOCUS_RING}`}>
              <p className="text-[#b7c3d4] text-[11px]">{stat.label}</p>
              <p className="text-2xl font-bold text-[#f1f5f9] mt-0.5 tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-[#9fb0c5] mt-1">{stat.helper}</p>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {hasWidget('tasks') && (
          <div className="bg-[#111827] rounded-xl border border-[#2b3a57]">
            <div className="p-3 border-b border-[#2b3a57] flex justify-between items-center">
              <h2 className="text-base font-semibold text-[#f1f5f9]">Nadchodzące zadania</h2>
              <Link to="/zadania" className={`text-xs text-[#b7c3d4] hover:text-white ${FOCUS_RING}`}>Zobacz wszystkie</Link>
            </div>
            <div className="p-2.5 space-y-1.5 h-56 overflow-y-auto">
              {loading && upcomingTasks.length === 0 ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-[#18243b] animate-pulse" />) : upcomingTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#3a4d70] p-4 text-sm text-[#c3cfdf] space-y-2">
                  <p>Brak zadań na dziś. Możesz szybko dodać szablon:</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link to="/zadania?template=callback" className={`px-2 py-1 rounded border border-[#3a4d70] hover:bg-[#16243d] ${FOCUS_RING}`}>Oddzwoń do klienta</Link>
                    <Link to="/zadania?template=refresh_listing" className={`px-2 py-1 rounded border border-[#3a4d70] hover:bg-[#16243d] ${FOCUS_RING}`}>Odśwież ofertę</Link>
                    <Link to="/zadania?template=send_offer" className={`px-2 py-1 rounded border border-[#3a4d70] hover:bg-[#16243d] ${FOCUS_RING}`}>Wyślij propozycję</Link>
                    <Link to="/zadania?template=schedule_presentation" className={`px-2 py-1 rounded border border-[#3a4d70] hover:bg-[#16243d] ${FOCUS_RING}`}>Ustaw prezentację</Link>
                  </div>
                </div>
              ) : upcomingTasks.map((task) => (
                <Link key={task.id} to="/zadania" className={`flex items-center gap-2.5 px-2.5 py-2 hover:bg-[#1f2937] rounded-lg ${FOCUS_RING}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${task.priority === 'high' || task.priority === 'urgent' ? 'bg-[#ef4444]' : task.priority === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-[#f1f5f9] truncate">{task.title}</p>
                    <p className="text-xs text-[#b7c3d4] truncate">{task.client} • termin: {new Date(task.date).toLocaleDateString('pl-PL')}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {hasWidget('activities') && (
          <div className="bg-[#111827] rounded-xl border border-[#2b3a57]">
            <div className="p-3 border-b border-[#2b3a57] flex justify-between items-center">
              <h2 className="text-base font-semibold text-[#f1f5f9]">Ostatnie aktywności</h2>
              <Link to="/feed" className={`text-xs text-[#b7c3d4] hover:text-white ${FOCUS_RING}`}>Pełny feed</Link>
            </div>
            <div className="p-2.5 space-y-1.5 h-56 overflow-y-auto">
              {loading && recentActivities.length === 0 ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-[#18243b] animate-pulse" />) : recentActivities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#3a4d70] p-3 text-xs text-[#c3cfdf]">Brak aktywności do wyświetlenia.</div>
              ) : recentActivities.map((activity) => {
                const Row = (
                  <>
                    <div className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center ${activity.toneClass}`}><activity.icon size={14} /></div>
                    <div className="min-w-0">
                      <p className="text-sm text-[#f1f5f9] truncate">{activity.title}</p>
                      <p className="text-xs text-[#b7c3d4] truncate">{activity.subtitle}</p>
                      <button className={`mt-1 text-[11px] text-cyan-300 hover:text-cyan-200 ${FOCUS_RING}`}>Utwórz zadanie z tej aktywności</button>
                    </div>
                    <span className="text-[11px] text-[#9fb0c5] ml-auto shrink-0">{activity.time}</span>
                    {activity.link ? <ArrowRight className="text-[#7f8ea3]" size={14} /> : null}
                  </>
                )
                return activity.link ? <Link key={activity.id} to={activity.link} className={`flex items-start gap-2.5 px-2.5 py-2 hover:bg-[#1f2937] rounded-lg ${FOCUS_RING}`}>{Row}</Link> : <div key={activity.id} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg">{Row}</div>
              })}
            </div>
          </div>
        )}
      </div>

      {hasWidget('quickActions') && (
        <div className="bg-[#111827] rounded-xl border border-[#2b3a57] p-3">
          <h2 className="text-base font-semibold text-[#f1f5f9] mb-2.5">Szybkie skróty</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Link to="/zadania?scope=today" className={`flex flex-col items-center gap-2 p-4 border border-[#2b3a57] rounded-xl hover:bg-[#1f2937] ${FOCUS_RING}`}><ClipboardList className="text-orange-400" size={30} /><span className="text-xs md:text-sm font-medium text-[#d2dceb]">Zadania dzisiaj</span></Link>
            <Link to="/leads" className={`flex flex-col items-center gap-2 p-4 border border-[#2b3a57] rounded-xl hover:bg-[#1f2937] ${FOCUS_RING}`}><Inbox className="text-fuchsia-400" size={30} /><span className="text-xs md:text-sm font-medium text-[#d2dceb]">Leady i zapytania</span></Link>
            <Link to="/market?focus=fresh" className={`flex flex-col items-center gap-2 p-4 border border-[#2b3a57] rounded-xl hover:bg-[#1f2937] ${FOCUS_RING}`}><Radar className="text-cyan-400" size={30} /><span className="text-xs md:text-sm font-medium text-[#d2dceb]">Monitoring rynku</span></Link>
            <Link to="/pipeline?view=kanban" className={`flex flex-col items-center gap-2 p-4 border border-[#2b3a57] rounded-xl hover:bg-[#1f2937] ${FOCUS_RING}`}><KanbanSquare className="text-indigo-400" size={30} /><span className="text-xs md:text-sm font-medium text-[#d2dceb]">Pipeline sprzedaży</span></Link>
          </div>
        </div>
      )}

      {hasWidget('marketOffers') && <MarketOffersCompactWidget compactDefault={false} />}

      {hasWidget('marketIntel') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-1 rounded-xl border border-[#2b3a57] bg-[#111a2b] p-3.5">
            <h2 className="text-sm font-semibold text-[#f1f5f9] mb-2">Inteligencja rynku</h2>
            {marketLoading ? <div className="space-y-2"><div className="h-4 bg-[#1d2940] rounded animate-pulse" /><div className="h-4 bg-[#1d2940] rounded animate-pulse" /></div> : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-[#b7c3d4]">Średnia cena m²</span><span className="text-[#f1f5f9] tabular-nums">{marketIntelligence.avgPriceM2 ? `${Math.round(marketIntelligence.avgPriceM2).toLocaleString('pl-PL')} zł` : 'Brak danych do wyliczenia'}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#b7c3d4]">Nowe oferty 24h</span><span className="text-[#f1f5f9] tabular-nums">{marketIntelligence.new24h}</span></div>
              </div>
            )}
          </div>
          <div className="xl:col-span-2 rounded-xl border border-[#2b3a57] bg-[#111a2b] p-3.5">
            <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-semibold text-[#f1f5f9]">Trend cen – ostatnie 30 dni</h2><span className="text-[11px] text-[#b7c3d4]">średnia cena/m²</span></div>
            {marketLoading ? <div className="h-24 rounded-lg bg-[#1d2940] animate-pulse" /> : metricStatuses.trend === 'ERROR' ? <div className="rounded-lg border border-dashed border-red-500/40 p-4 text-xs text-red-300">Błąd pobierania trendu cen</div> : trend.some((p) => p.value > 0) ? <svg viewBox="0 0 300 90" className="w-full h-24"><polyline fill="none" stroke="var(--accent-main)" strokeWidth="2" points={trend.map((p, i) => { const max = Math.max(...trend.map((x) => x.value || 0), 1); const x = (i / Math.max(trend.length - 1, 1)) * 300; const y = 80 - ((p.value || 0) / max) * 70; return `${x},${y}` }).join(' ')} /></svg> : <div className="rounded-lg border border-dashed border-[#3a4d70] p-4 text-xs text-[#c3cfdf]">Za mało danych historycznych</div>}
          </div>
        </div>
      )}

      {hasWidget('marketWidgets') && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <MarketOpportunitiesWidget />
          <MarketAlertsWidget />
          <MarketHeatmapWidget />
        </div>
      )}

      {listingStatsError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle size={14} /> Część metryk działa w trybie fallback. API dashboard/listing-stats zwróciło błąd.
        </div>
      )}
    </div>
  )
}

export default Dashboard
