import { useEffect, useMemo, useState } from 'react'
import type { ListingEx, MonitoringJob, MonitoringJobsResponse, MonitoringStats, SourceDiagnostics, SourceSummaryItem } from './monitoring/types'
import { extractErrorMessage, extractErrorReason, formatDateTime, getSourceRiskScore, normalizeJobStatus, sourceLabel, statusMeta } from './monitoring/utils'
import SourcesCockpit from './monitoring/SourcesCockpit'
import SourceDiagnosticsPanel from './monitoring/SourceDiagnosticsPanel'
import { ExternalLink, RefreshCw, Search, SlidersHorizontal, X, AlertTriangle, CheckCircle2, Clock3, Info, RotateCcw, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/apiClient'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'


const REGION_KEY = 'mw.market.region-filter'
const DEFAULT_REGION = 'pomorskie'
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ffc6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220]'


const Marketplace = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const [sources, setSources] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [listings, setListings] = useState<ListingEx[]>([])
  const [loading, setLoading] = useState(true)
  const [runLoading, setRunLoading] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

  const [stats, setStats] = useState<MonitoringStats | null>(null)
  const [jobStatusFilter, setJobStatusFilter] = useState('failed')
  const [jobSourceFilter, setJobSourceFilter] = useState('all')
  const [jobPage, setJobPage] = useState(1)
  const [jobPageSize] = useState(20)
  const [jobsData, setJobsData] = useState<MonitoringJobsResponse | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([])
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [sourceHealthFilter, setSourceHealthFilter] = useState<'all' | 'problem'>('all')
  const [sourceActionLoadingId, setSourceActionLoadingId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [sourceDiagnostics, setSourceDiagnostics] = useState<SourceDiagnostics | null>(null)
  const [sourceDiagnosticsLoading, setSourceDiagnosticsLoading] = useState(false)
  const [sourcesSummary, setSourcesSummary] = useState<SourceSummaryItem[]>([])
  const [sourcesSortMode, setSourcesSortMode] = useState<'risk' | 'name' | 'successRate' | 'failed' | 'partial'>('risk')

  const [q, setQ] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState<string>(() => localStorage.getItem(REGION_KEY) || DEFAULT_REGION)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(15)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const [watchedIds, setWatchedIds] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])

  const detailsOpen = location.pathname === '/monitoring/errors'

  const loadMonitoringStats = async () => {
    const data = await apiFetch<MonitoringStats>('/monitoring/stats')
    setStats(data)
  }

  const loadMonitoringJobs = async (page = jobPage, status = jobStatusFilter, source = jobSourceFilter) => {
    try {
      setJobsLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(jobPageSize),
        sort: 'desc',
      })
      if (status !== 'all') params.set('status', status)
      if (source !== 'all') params.set('source', source)
      const data = await apiFetch<MonitoringJobsResponse>(`/monitoring/jobs?${params.toString()}`)
      setJobsData(data)
    } finally {
      setJobsLoading(false)
    }
  }

  const load = async () => {
    try {
      setLoading(true)
      const [src, js, ls, wl, cmp, statsData, sourcesSummaryData] = await Promise.all([
        apiFetch<any[]>('/external-sources'),
        apiFetch<any[]>('/external-import/jobs'),
        apiFetch<ListingEx[]>('/external-listings?onlyActive=1'),
        apiFetch<string[]>('/external-listings/watchlist'),
        apiFetch<string[]>('/external-listings/compare'),
        apiFetch<MonitoringStats>('/monitoring/stats'),
        apiFetch<{ items: SourceSummaryItem[] }>('/monitoring/sources-summary'),
      ])
      setSources(src)
      setJobs(js)
      setListings(ls)
      setWatchedIds(wl || [])
      setCompareIds(cmp || [])
      setStats(statsData)
      setSourcesSummary(sourcesSummaryData?.items || [])
    } catch {
      setSources([])
      setJobs([])
      setListings([])
      setWatchedIds([])
      setCompareIds([])
      setStats(null)
      setSourcesSummary([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 15000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (detailsOpen) {
      void loadMonitoringJobs(jobPage, jobStatusFilter, jobSourceFilter)
    }
  }, [detailsOpen, jobPage, jobStatusFilter, jobSourceFilter])

  useEffect(() => {
    if (selectedSourceId) {
      void loadSourceDiagnostics(selectedSourceId)
    } else {
      setSourceDiagnostics(null)
    }
  }, [selectedSourceId])

  const runImport = async () => {
    try {
      setRunLoading(true)
      await apiFetch('/external-import/run-async', { method: 'POST' })
      setTimeout(() => void load(), 1500)
    } finally {
      setRunLoading(false)
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      setRetryingJobId(jobId)
      await apiFetch(`/monitoring/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })
      await Promise.all([load(), loadMonitoringStats(), detailsOpen ? loadMonitoringJobs(jobPage, jobStatusFilter, jobSourceFilter) : Promise.resolve()])
    } finally {
      setRetryingJobId(null)
    }
  }

  const runSourceImport = async (sourceId: string) => {
    try {
      setSourceActionLoadingId(sourceId)
      await apiFetch('/external-import/run-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      })
      setTimeout(() => {
        void load()
        void loadMonitoringStats()
        if (selectedSourceId === sourceId) void loadSourceDiagnostics(sourceId)
      }, 1200)
    } finally {
      setSourceActionLoadingId(null)
    }
  }

  const loadSourceDiagnostics = async (sourceId: string) => {
    try {
      setSourceDiagnosticsLoading(true)
      const data = await apiFetch<SourceDiagnostics>(`/monitoring/sources/${encodeURIComponent(sourceId)}`)
      setSourceDiagnostics(data)
    } finally {
      setSourceDiagnosticsLoading(false)
    }
  }

  const handleIngest = async (id: string) => {
    try {
      setImportingId(id)
      await apiFetch(`/external-listings/${id}/ingest`, { method: 'POST' })
      await load()
    } catch {
      // noop
    } finally {
      setImportingId(null)
    }
  }

  const toggleObserved = async (id: string) => {
    try {
      if (watchedIds.includes(id)) {
        await apiFetch(`/external-listings/${id}/watch`, { method: 'DELETE' })
        setWatchedIds((prev) => prev.filter((x) => x !== id))
      } else {
        await apiFetch(`/external-listings/${id}/watch`, { method: 'POST' })
        setWatchedIds((prev) => [...prev, id])
      }
    } catch {
      // noop
    }
  }

  const toggleCompare = async (id: string) => {
    try {
      if (compareIds.includes(id)) {
        const rows = await apiFetch<string[]>(`/external-listings/${id}/compare`, { method: 'DELETE' })
        setCompareIds(rows || [])
      } else {
        const rows = await apiFetch<string[]>(`/external-listings/${id}/compare`, { method: 'POST' })
        setCompareIds(rows || [])
      }
    } catch {
      // noop
    }
  }

  const voivodeships = useMemo(
    () => [...new Set(listings.map((x) => (x.voivodeship || '').trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl')),
    [listings]
  )

  useEffect(() => {
    localStorage.setItem(REGION_KEY, regionFilter)
  }, [regionFilter])

  const filtered = useMemo(() => {
    return listings.filter((item) => {
      const text = `${item.title || ''} ${item.city || ''} ${item.sourceName || ''}`.toLowerCase()
      if (q && !text.includes(q.toLowerCase())) return false
      if (sourceFilter !== 'all' && item.sourceCode !== sourceFilter) return false
      if (typeFilter !== 'all' && item.propertyType !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (regionFilter !== 'all' && (item.voivodeship || '').trim().toLowerCase() !== regionFilter) return false
      return true
    })
  }, [listings, q, sourceFilter, typeFilter, statusFilter, regionFilter])

  const sourceCodes = useMemo(
    () => [...new Set(listings.map((x) => x.sourceCode).filter(Boolean))] as string[],
    [listings]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [q, sourceFilter, typeFilter, statusFilter, regionFilter, itemsPerPage, viewMode])

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, safePage, itemsPerPage])

  const mediansMap = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const item of listings) {
      const area = Number(item.areaM2 || 0)
      const price = Number(item.price || 0)
      if (!area || !price) continue
      const ppm2 = price / area
      const key = `${(item.city || '').toLowerCase()}|${item.propertyType}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)?.push(ppm2)
    }

    const out = new Map<string, number>()
    for (const [key, arr] of groups.entries()) {
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      out.set(key, median)
    }
    return out
  }, [listings])

  const analyticsFor = (item: ListingEx) => {
    const price = Number(item.price || 0)
    const area = Number(item.areaM2 || 0)
    const ppm2 = area > 0 ? price / area : 0
    const key = `${(item.city || '').toLowerCase()}|${item.propertyType}`
    const median = Number(mediansMap.get(key) || 0)
    const belowPct = median > 0 && ppm2 > 0 ? ((median - ppm2) / median) * 100 : 0

    let status = 'ŚREDNIA'
    let cls = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    if (item.status === 'new') {
      status = 'NEW'
      cls = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    } else if (belowPct >= 10) {
      status = 'OKAZJA'
      cls = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    } else if (belowPct >= 3) {
      status = 'PONIŻEJ RYNKU'
      cls = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    } else if (belowPct <= -10) {
      status = 'WYSOKA CENA'
      cls = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    }

    return { ppm2, median, belowPct, status, cls }
  }

  const formatMoney = (v: number) => `${Math.round(v || 0).toLocaleString('pl-PL')} zł`

  const failedBreakdown = stats?.failedJobsBySource || []
  const jobsBySourceFilter = useMemo(() => {
    if (!jobsData?.items?.length) return []
    return [...new Set(jobsData.items.map((item) => item.sourceCode).filter(Boolean))] as string[]
  }, [jobsData])

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobIds((prev) => prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId])
  }

  const sortedSourcesSummary = useMemo(() => {
    const rows = [...sourcesSummary]
    rows.sort((a, b) => {
      if (sourcesSortMode === 'name') return a.source.name.localeCompare(b.source.name, 'pl')
      if (sourcesSortMode === 'successRate') return (a.stats24h.successRate24h ?? -1) - (b.stats24h.successRate24h ?? -1)
      if (sourcesSortMode === 'failed') return b.stats24h.failed - a.stats24h.failed
      if (sourcesSortMode === 'partial') return b.listings.partial - a.listings.partial
      return getSourceRiskScore(b) - getSourceRiskScore(a)
    })
    return rows
  }, [sourcesSummary, sourcesSortMode])

  const statCardBase = 'rounded-xl border p-3 transition-all duration-200'

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#e5e7eb]">Monitoring rynku</h1>
          <p className="text-sm text-[#94a3b8]">Oferty zewnętrzne + pipeline importu ofert</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/market')} />
          <button
            onClick={() => void runImport()}
            disabled={runLoading}
            className={`flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 ${FOCUS_RING}`}
          >
            <RefreshCw size={18} className={runLoading ? 'animate-spin' : ''} />
            {runLoading ? 'Uruchamianie...' : 'Uruchom import teraz'}
          </button>
          <button onClick={() => void load()} className={`px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${FOCUS_RING}`}>
            Odśwież
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-7 gap-3">
        <div className={`${statCardBase} bg-[#111a2b] border-[#26324a]`}>
          <div className="text-xl font-bold text-[#e5e7eb] tabular-nums">{stats?.activeListings ?? listings.length}</div>
          <div className="text-xs text-[#94a3b8]">Aktywne oferty zewnętrzne</div>
        </div>
        <div className={`${statCardBase} bg-[#111a2b] border-[#26324a]`}>
          <div className="text-xl font-bold text-blue-400 tabular-nums">{stats?.activeSources ?? sources.filter((s) => s.isActive).length}</div>
          <div className="text-xs text-[#94a3b8]">Aktywne źródła</div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/monitoring/errors')}
          className={`${statCardBase} bg-red-950/20 border-red-500/30 hover:border-red-400/50 hover:bg-red-950/30 text-left ${FOCUS_RING}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xl font-bold text-red-300 tabular-nums">{stats?.failedJobs24h ?? jobs.filter((j) => j.status === 'failed').length}</div>
              <div className="text-xs text-[#d6dee9]">Błędy importu{stats?.windowHours === 24 ? ' (24h)' : ''}</div>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="Pokaż objaśnienie błędów importu"
                title="Liczba nieudanych prób pobrania lub przetworzenia ofert w ciągu ostatnich 24 godzin."
                onClick={(e) => {
                  e.stopPropagation()
                  setShowBreakdown((prev) => !prev)
                }}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-200 hover:bg-red-500/10 ${FOCUS_RING}`}
              >
                <Info size={14} />
              </button>
              {showBreakdown && (
                <div className="absolute right-0 top-10 z-20 w-72 rounded-xl border border-[#2f3b57] bg-[#0b1220] p-3 shadow-2xl">
                  <p className="text-xs text-[#dbe5f2] leading-relaxed">Liczba nieudanych prób pobrania lub przetworzenia ofert w ciągu ostatnich 24 godzin.</p>
                  <div className="mt-3 border-t border-[#1f2b43] pt-3 space-y-1.5">
                    {failedBreakdown.length > 0 ? failedBreakdown.map((row) => (
                      <div key={`${row.sourceCode}-${row.sourceName}`} className="flex items-center justify-between text-xs">
                        <span className="text-[#9fb0cf]">{sourceLabel(row.sourceCode, row.sourceName)}</span>
                        <span className="font-semibold text-red-300 tabular-nums">{row.count}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-[#94a3b8]">Brak błędów importu w ostatnich 24 godzinach.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </button>
        <div className={`${statCardBase} bg-[#111a2b] border-emerald-500/25`}>
          <div className="text-xl font-bold text-emerald-300 tabular-nums">{stats?.successfulJobs24h ?? jobs.filter((j) => j.status === 'success').length}</div>
          <div className="text-xs text-[#94a3b8]">Udane joby</div>
        </div>
        <div className={`${statCardBase} bg-[#111a2b] border-amber-500/25`}>
          <div className="text-xl font-bold text-amber-300 tabular-nums">{stats?.pendingJobs ?? jobs.filter((j) => ['running', 'pending', 'retrying'].includes(String(j.status))).length}</div>
          <div className="text-xs text-[#94a3b8]">Joby oczekujące / retry</div>
        </div>
        <Link to="/nieruchomosci?import=partial" className={`${statCardBase} bg-[#111a2b] border-violet-500/25 hover:border-violet-400/40 ${FOCUS_RING}`}>
          <div className="text-xl font-bold text-violet-300 tabular-nums">{stats?.partialImportListings ?? 0}</div>
          <div className="text-xs text-[#94a3b8]">Oferty z danymi częściowymi</div>
        </Link>
        <button type="button" onClick={() => setSourceHealthFilter((prev) => prev === 'problem' ? 'all' : 'problem')} className={`${statCardBase} bg-[#111a2b] border-rose-500/25 hover:border-rose-400/40 text-left ${FOCUS_RING}`}>
          <div className="text-xl font-bold text-rose-300 tabular-nums">{stats?.unhealthySources ?? 0}</div>
          <div className="text-xs text-[#94a3b8]">Źródła wymagające uwagi</div>
        </button>
      </div>

      {detailsOpen && (
        <section className="bg-[#111a2b] rounded-xl border border-[#26324a] p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#f1f5f9]">Błędy i statusy importu</h2>
              <p className="text-sm text-[#94a3b8]">Warstwa pipeline/importu jest oddzielona od listy ofert. Tutaj analizujesz joby pobierania i przetwarzania danych.</p>
            </div>
            <Link to="/market" className={`inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-[#2f3b57] text-sm text-[#cbd5e1] hover:bg-[#16243d] ${FOCUS_RING}`}>
              Wróć do ofert
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
              <label className="block text-xs text-[#9fb0cf] mb-1.5">Status joba</label>
              <select value={jobStatusFilter} onChange={(e) => { setJobStatusFilter(e.target.value); setJobPage(1) }} className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]" title="Filtr statusu joba">
                <option value="all">Wszystkie statusy</option>
                {(jobsData?.supportedStatuses || stats?.supportedStatuses || []).map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
              <label className="block text-xs text-[#9fb0cf] mb-1.5">Źródło</label>
              <select value={jobSourceFilter} onChange={(e) => { setJobSourceFilter(e.target.value); setJobPage(1) }} className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]" title="Filtr źródła błędu">
                <option value="all">Wszystkie źródła</option>
                {Array.from(new Set([...failedBreakdown.map((item) => item.sourceCode), ...jobsBySourceFilter])).filter(Boolean).map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-[#26324a] bg-[#0f172a] p-3">
              <p className="text-xs text-[#9fb0cf] mb-1.5">Wspierane statusy UI</p>
              <div className="flex flex-wrap gap-2">
                {(stats?.supportedStatuses || []).map((status) => {
                  const meta = statusMeta[status] || statusMeta[normalizeJobStatus(status)]
                  return <span key={status} className={`text-[11px] px-2 py-1 rounded-full ${meta?.className || 'border border-[#2f3b57] text-[#cbd5e1]'}`}>{meta?.label || status}</span>
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#26324a] bg-[#0f172a] overflow-hidden">
            <div className="hidden lg:grid grid-cols-[1.1fr_180px_120px_160px_1.5fr_120px_220px] gap-3 px-4 py-3 text-[11px] uppercase tracking-wide text-[#7f90ab] border-b border-[#1e2d45]">
              <span>Źródło</span>
              <span>Data błędu</span>
              <span>Status</span>
              <span>Typ błędu</span>
              <span>Komunikat</span>
              <span>Retry</span>
              <span>Akcje</span>
            </div>

            {jobsLoading ? (
              <div className="p-6 text-sm text-[#94a3b8]">Ładowanie jobów importu…</div>
            ) : jobsData?.items?.length ? jobsData.items.map((job) => {
              const normalizedStatus = normalizeJobStatus(job.status)
              const meta = statusMeta[job.status] || statusMeta[normalizedStatus]
              const expanded = expandedJobIds.includes(job.id)
              return (
                <div key={job.id} className="border-b last:border-b-0 border-[#1e2d45] px-4 py-4 space-y-3">
                  <div className="grid lg:grid-cols-[1.1fr_180px_120px_160px_1.5fr_120px_220px] gap-3 items-start">
                    <div>
                      <p className="font-medium text-[#f1f5f9]">{sourceLabel(job.sourceCode, job.sourceName)}</p>
                      <p className="text-xs text-[#7f90ab]">Job ID: <span className="font-mono">{job.id}</span></p>
                    </div>
                    <div className="text-sm text-[#d6dee9]">{formatDateTime(job.finishedAt || job.startedAt)}</div>
                    <div>
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs ${meta?.className || 'border border-[#2f3b57] text-[#cbd5e1]'}`}>{meta?.label || job.status}</span>
                    </div>
                    <div className="text-sm text-[#fca5a5]">{extractErrorReason(job)}</div>
                    <div className="text-sm text-[#cbd5e1] break-words">{extractErrorMessage(job)}</div>
                    <div className="text-sm text-[#d6dee9] tabular-nums">{job.retryCount ?? 0}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void retryJob(job.id)}
                        disabled={retryingJobId === job.id || normalizedStatus !== 'failed'}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs ${normalizedStatus === 'failed' ? 'border-[#f97316]/40 text-[#fdba74] hover:bg-[#f97316]/10' : 'border-[#2f3b57] text-[#64748b] cursor-not-allowed'} ${FOCUS_RING}`}
                      >
                        <RotateCcw size={13} />
                        {retryingJobId === job.id ? 'Ponawianie…' : 'Ponów'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleJobExpanded(job.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2f3b57] text-xs text-[#cbd5e1] hover:bg-[#16243d] ${FOCUS_RING}`}
                      >
                        <Eye size={13} />
                        Pokaż szczegóły
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="rounded-lg border border-[#22314d] bg-[#0b1220] p-3 text-sm space-y-2">
                      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-[#7f90ab]">Start</p>
                          <p className="text-[#e5e7eb]">{formatDateTime(job.details?.startedAt || job.startedAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7f90ab]">Koniec</p>
                          <p className="text-[#e5e7eb]">{formatDateTime(job.details?.finishedAt || job.finishedAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7f90ab]">Przetworzono</p>
                          <p className="text-[#e5e7eb] tabular-nums">{job.details?.processedCount ?? job.processedCount ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7f90ab]">Nowe / zaktualizowane / nieaktywne</p>
                          <p className="text-[#e5e7eb] tabular-nums">{job.details?.newCount ?? job.newCount ?? 0} / {job.details?.updatedCount ?? job.updatedCount ?? 0} / {job.details?.inactiveCount ?? job.inactiveCount ?? 0}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[#7f90ab] mb-1">Diagnostyka</p>
                        <pre className="whitespace-pre-wrap break-words rounded-md bg-[#08101d] border border-[#1e2d45] p-3 text-xs text-[#cbd5e1]">{job.details?.errorLog || job.errorLog || 'Brak dodatkowych danych diagnostycznych.'}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            }) : (
              <div className="p-6 text-sm text-[#94a3b8]">Brak błędów importu w ostatnich 24 godzinach.</div>
            )}
          </div>

          {jobsData && jobsData.total > jobsData.pageSize && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#94a3b8]">Strona {jobsData.page} · rekordów: {jobsData.total}</p>
              <div className="flex gap-2">
                <button type="button" disabled={jobsData.page <= 1} onClick={() => setJobPage((p) => Math.max(1, p - 1))} className={`px-3 py-2 rounded-lg border border-[#2f3b57] text-sm text-[#cbd5e1] disabled:opacity-40 ${FOCUS_RING}`}>Poprzednia</button>
                <button type="button" disabled={!jobsData.hasMore} onClick={() => setJobPage((p) => p + 1)} className={`px-3 py-2 rounded-lg border border-[#2f3b57] text-sm text-[#cbd5e1] disabled:opacity-40 ${FOCUS_RING}`}>Następna</button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(sourceHealthFilter === 'problem' ? (stats?.sourceHealth || []).filter((source) => source.health === 'error' || source.health === 'warning') : sources).map((source) => (
              <span key={source.id} title={source.lastError || undefined} className={`text-[10px] px-2 py-0.5 rounded-full border ${source.health === 'error' ? 'border-red-500/40 text-red-300 bg-red-500/10' : source.health === 'warning' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : 'border-[#2f3b57] text-[#9fb0cf]'}`}>
                {source.code}: {source.lastStatus || 'brak'}{source.stale ? ' · stale' : ''}
              </span>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Link to="/nieruchomosci?import=partial" className={`px-2.5 py-1 rounded text-xs border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 ${FOCUS_RING}`}>Oferty z danymi częściowymi</Link>
            <button type="button" onClick={() => setSourceHealthFilter((prev) => prev === 'problem' ? 'all' : 'problem')} className={`px-2.5 py-1 rounded text-xs border ${sourceHealthFilter === 'problem' ? 'border-rose-500/40 text-rose-300 bg-rose-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Problematyczne źródła</button>
            <button onClick={() => setViewMode('cards')} className={`px-2.5 py-1 rounded text-xs ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'border border-[#2f3b57] text-[#cbd5e1]'}`}>Kafelki</button>
            <button onClick={() => setViewMode('list')} className={`px-2.5 py-1 rounded text-xs ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'border border-[#2f3b57] text-[#cbd5e1]'}`}>Lista</button>
          </div>
        </div>

        <div className="space-y-3">
          <SourcesCockpit
            items={sortedSourcesSummary}
            selectedSourceId={selectedSourceId}
            sourceActionLoadingId={sourceActionLoadingId}
            sourcesSortMode={sourcesSortMode}
            setSourcesSortMode={setSourcesSortMode}
            setSelectedSourceId={setSelectedSourceId}
            runSourceImport={runSourceImport}
            goToErrors={(sourceCode) => { setJobSourceFilter(sourceCode); setJobStatusFilter('failed'); setJobPage(1); navigate('/monitoring/errors') }}
            focusRing={FOCUS_RING}
          />

          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
            <div>
              <div className="hidden md:flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7f90ab]" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po tytule, mieście, źródle…" className="pl-8 pr-3 py-2 bg-[#0f172a] border border-[#2f3b57] rounded-lg text-sm text-[#e5e7eb] placeholder:text-[#64748b] w-72" />
          </div>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filtr źródła" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
            <option value="all">Źródło</option>
            {sourceCodes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} title="Filtr typu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
            <option value="all">Typ</option>
            {[...new Set(listings.map((x) => x.propertyType).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Filtr statusu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
            <option value="all">Status</option>
            {[...new Set(listings.map((x) => x.status).filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} title="Filtr regionu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
            <option value="all">Województwo</option>
            {voivodeships.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={String(itemsPerPage)} onChange={(e) => setItemsPerPage(Number(e.target.value))} title="Liczba elementów" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
            {[15, 30, 60].map((n) => <option key={n} value={n}>{n} / strona</option>)}
          </select>
                <button onClick={() => setMobileFiltersOpen(true)} className={`md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1] ${FOCUS_RING}`}><SlidersHorizontal size={16} /> Filtry</button>
              </div>
            </div>

            <div className="rounded-xl border border-[#22314d] bg-[#0b1220] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#f1f5f9]">Status źródeł importu</p>
                <p className="text-xs text-[#7f90ab]">Operator console dla źródeł monitoringu</p>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {(sourceHealthFilter === 'problem' ? (stats?.sourceHealth || []).filter((source) => source.health === 'error' || source.health === 'warning') : (stats?.sourceHealth || sources)).map((source) => (
                <div key={source.id} className="rounded-lg border border-[#1e2d45] bg-[#0f172a] p-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#f1f5f9] truncate">{source.name}</p>
                      <p className="text-[11px] text-[#7f90ab]">{source.code} · {source.lastSyncAt ? formatDateTime(source.lastSyncAt) : 'brak sync'}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${source.health === 'error' ? 'border-red-500/40 text-red-300 bg-red-500/10' : source.health === 'warning' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : source.health === 'ok' ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-[#2f3b57] text-[#94a3b8]'}`}>{source.health || 'idle'}</span>
                  </div>
                  <div className="text-[11px] text-[#cbd5e1]">
                    <p>Status: <span className="text-[#f1f5f9]">{source.lastStatus || 'brak'}</span>{source.stale ? <span className="text-amber-300"> · brak świeżego syncu</span> : null}</p>
                    {source.lastError ? <p className="mt-1 text-red-300 line-clamp-2">{source.lastError}</p> : <p className="mt-1 text-[#7f90ab]">Brak ostatniego błędu.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedSourceId((prev) => prev === source.id ? null : source.id)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] ${selectedSourceId === source.id ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' : 'border-[#2f3b57] text-[#cbd5e1] hover:bg-[#16243d]'} ${FOCUS_RING}`}>
                      <Eye size={12} />
                      Diagnostyka
                    </button>
                    <button type="button" onClick={() => void runSourceImport(source.id)} disabled={sourceActionLoadingId === source.id || source.isActive === false} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] ${source.isActive === false ? 'border-[#2f3b57] text-[#64748b] cursor-not-allowed' : 'border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10'} ${FOCUS_RING}`}>
                      <RefreshCw size={12} className={sourceActionLoadingId === source.id ? 'animate-spin' : ''} />
                      {sourceActionLoadingId === source.id ? 'Kolejkowanie…' : 'Importuj teraz'}
                    </button>
                    <button type="button" onClick={() => { setJobSourceFilter(source.code); setJobStatusFilter('failed'); setJobPage(1); navigate('/monitoring/errors') }} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 ${FOCUS_RING}`}>
                      <AlertTriangle size={12} />
                      Pokaż błędy
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <SourceDiagnosticsPanel
              selectedSourceId={selectedSourceId}
              sourceDiagnosticsLoading={sourceDiagnosticsLoading}
              sourceDiagnostics={sourceDiagnostics}
              onClose={() => setSelectedSourceId(null)}
              focusRing={FOCUS_RING}
            />
          </div>
        </div>

              <div className="md:hidden flex items-center gap-2">
                <button onClick={() => setMobileFiltersOpen(true)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1] ${FOCUS_RING}`}><SlidersHorizontal size={16} /> Filtry</button>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7f90ab]" size={16} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj…" className="w-full pl-8 pr-3 py-2 bg-[#0f172a] border border-[#2f3b57] rounded-lg text-sm text-[#e5e7eb] placeholder:text-[#64748b]" />
                </div>
              </div>
            </div>
          </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-[#26324a] bg-[#111a2b] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#f1f5f9]">Filtry monitoringu</h3>
              <button onClick={() => setMobileFiltersOpen(false)} title="Zamknij filtry" className="p-2 rounded-lg text-[#9fb0cf]"><X size={16} /></button>
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filtr źródła" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Źródło</option>
              {sourceCodes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} title="Filtr typu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Typ</option>
              {[...new Set(listings.map((x) => x.propertyType).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Filtr statusu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Status</option>
              {[...new Set(listings.map((x) => x.status).filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} title="Filtr regionu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Województwo</option>
              {voivodeships.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => { setSourceFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setRegionFilter(DEFAULT_REGION) }} className="px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1]">Wyczyść</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#26324a] bg-[#111a2b] p-6 text-sm text-[#94a3b8]">Ładowanie monitoringu rynku…</div>
      ) : viewMode === 'cards' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((item) => {
            const a = analyticsFor(item)
            const importedPartial = Array.isArray(item.images) && item.images.length === 0
            const importedPartialReason = importedPartial ? 'Oferta została zaimportowana częściowo — brakuje części kluczowych danych lub mediów.' : ''
            return (
              <div key={item.id} className="bg-[#111a2b] rounded-xl border border-[#26324a] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#f1f5f9] leading-snug">{item.title || 'Bez tytułu'}</h3>
                    <p className="text-xs text-[#94a3b8]">{item.city || '—'}{item.district ? `, ${item.district}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.cls}`}>{a.status}</span>
                    {item.status ? <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#2f3b57] text-[#9fb0cf]">{item.status}</span> : null}
                    {importedPartial ? <span title={importedPartialReason} className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">Dane częściowe</span> : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[#94a3b8] text-xs">Cena</p>
                    <p className="font-semibold text-[#f1f5f9]">{formatMoney(Number(item.price || 0))}</p>
                  </div>
                  <div>
                    <p className="text-[#94a3b8] text-xs">m²</p>
                    <p className="font-semibold text-[#f1f5f9]">{item.areaM2 ? `${Number(item.areaM2).toLocaleString('pl-PL')} m²` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#94a3b8] text-xs">Źródło</p>
                    <p className="text-[#d6dee9]">{item.sourceName || item.sourceCode || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#94a3b8] text-xs">Cena / m²</p>
                    <p className="text-[#d6dee9]">{a.ppm2 ? `${Math.round(a.ppm2).toLocaleString('pl-PL')} zł` : '—'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => void toggleObserved(item.id)} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border ${watchedIds.includes(item.id) ? 'border-cyan-400/40 text-cyan-300 bg-cyan-500/10' : 'border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b]'} ${FOCUS_RING}`}>{watchedIds.includes(item.id) ? 'Obserwowane' : 'Obserwuj'}</button>
                  <button type="button" onClick={() => void toggleCompare(item.id)} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border ${compareIds.includes(item.id) ? 'border-violet-400/40 text-violet-300 bg-violet-500/10' : 'border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b]'} ${FOCUS_RING}`}>{compareIds.includes(item.id) ? 'W porównaniu' : 'Porównaj'}</button>
                  <button type="button" onClick={() => void handleIngest(item.id)} disabled={importingId === item.id} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] disabled:opacity-60 ${FOCUS_RING}`}>{importingId === item.id ? 'Import...' : 'Importuj do CRM'}</button>
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`} title="Na stronę"><ExternalLink size={12} /> Na stronę</a> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_110px_110px_120px_130px_170px] gap-3 px-4 py-3 text-[11px] uppercase tracking-wide text-[#7f90ab] border-b border-[#1e2d45]">
            <span>Oferta</span>
            <span>Cena</span>
            <span>Powierzchnia</span>
            <span>Status</span>
            <span>Źródło</span>
            <span>Akcje</span>
          </div>
          {paginated.map((item) => {
            const importedPartial = Array.isArray(item.images) && item.images.length === 0
            const importedPartialReason = importedPartial ? 'Oferta została zaimportowana częściowo — brakuje części kluczowych danych lub mediów.' : ''
            return (
              <div key={item.id} className="grid md:grid-cols-[1.4fr_110px_110px_120px_130px_170px] gap-3 px-4 py-4 border-b last:border-b-0 border-[#1e2d45] items-center">
                <div>
                  <p className="font-medium text-[#f1f5f9]">{item.title || 'Bez tytułu'}</p>
                  <p className="text-xs text-[#94a3b8]">{item.city || '—'}{item.district ? `, ${item.district}` : ''}</p>
                </div>
                <div className="text-sm text-[#e5e7eb]">{formatMoney(Number(item.price || 0))}</div>
                <div className="text-sm text-[#d6dee9]">{item.areaM2 ? `${Number(item.areaM2).toLocaleString('pl-PL')} m²` : '—'}</div>
                <div className="flex flex-wrap gap-1.5">{item.status ? <span className="text-[10px] px-2 py-0.5 rounded border border-[#2f3b57] text-[#9fb0cf]">{item.status}</span> : null}{importedPartial ? <span title={importedPartialReason} className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">Dane częściowe</span> : null}</div>
                <div className="text-sm text-[#cbd5e1]">{item.sourceName || item.sourceCode || '—'}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleIngest(item.id)} disabled={importingId === item.id} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] disabled:opacity-60 ${FOCUS_RING}`}>{importingId === item.id ? 'Import...' : 'Importuj'}</button>
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`} title="Na stronę"><ExternalLink size={12} /></a> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm text-[#94a3b8]">
        <p>Łącznie ofert: {filtered.length}</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className={`px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1] disabled:opacity-40 ${FOCUS_RING}`}>Poprzednia</button>
          <span>Strona {safePage} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className={`px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1] disabled:opacity-40 ${FOCUS_RING}`}>Następna</button>
        </div>
      </div>
    </div>
  )
}

export default Marketplace
