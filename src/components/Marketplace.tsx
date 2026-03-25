import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'
import { ExternalListing } from '../types'

type ListingEx = ExternalListing & {
  previousPrice?: number | null
  priceChangePct?: number | null
}

const REGION_KEY = 'mw.market.region-filter'
const DEFAULT_REGION = 'pomorskie'

const Marketplace = () => {
  const [sources, setSources] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [listings, setListings] = useState<ListingEx[]>([])
  const [loading, setLoading] = useState(true)
  const [runLoading, setRunLoading] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

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

  const load = async () => {
    try {
      setLoading(true)
      const [src, js, ls, wl, cmp] = await Promise.all([
        apiFetch<any[]>('/external-sources'),
        apiFetch<any[]>('/external-import/jobs'),
        apiFetch<ListingEx[]>('/external-listings?onlyActive=1'),
        apiFetch<string[]>('/external-listings/watchlist'),
        apiFetch<string[]>('/external-listings/compare'),
      ])
      setSources(src)
      setJobs(js)
      setListings(ls)
      setWatchedIds(wl || [])
      setCompareIds(cmp || [])
    } catch {
      setSources([])
      setJobs([])
      setListings([])
      setWatchedIds([])
      setCompareIds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 15000)
    return () => clearInterval(id)
  }, [])

  const runImport = async () => {
    try {
      setRunLoading(true)
      await apiFetch('/external-import/run-async', { method: 'POST' })
      setTimeout(() => void load(), 1500)
    } finally {
      setRunLoading(false)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#e5e7eb]">Monitoring rynku</h1>
          <p className="text-sm text-[#94a3b8]">Oferty zewnętrzne + status importu</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/market')} />
          <button
            onClick={() => void runImport()}
            disabled={runLoading}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={18} className={runLoading ? 'animate-spin' : ''} />
            {runLoading ? 'Uruchamianie...' : 'Uruchom import teraz'}
          </button>
          <button onClick={() => void load()} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            Odśwież
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3">
          <div className="text-xl font-bold text-[#e5e7eb] tabular-nums">{listings.length}</div>
          <div className="text-xs text-[#94a3b8]">Aktywne oferty zewnętrzne</div>
        </div>
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3">
          <div className="text-xl font-bold text-blue-400 tabular-nums">{sources.filter((s) => s.isActive).length}</div>
          <div className="text-xs text-[#94a3b8]">Aktywne źródła</div>
        </div>
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3">
          <div className="text-xl font-bold text-[#f59e0b] tabular-nums">{jobs.filter((j) => j.status === 'failed').length}</div>
          <div className="text-xs text-[#94a3b8]">Błędne joby</div>
        </div>
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3">
          <div className="text-xl font-bold text-[#22c55e] tabular-nums">{jobs.filter((j) => j.status === 'success').length}</div>
          <div className="text-xs text-[#94a3b8]">Udane joby</div>
        </div>
      </div>

      <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source) => (
              <span key={source.id} className="text-[10px] px-2 py-0.5 rounded-full border border-[#2f3b57] text-[#9fb0cf]">
                {source.code}: {source.lastStatus || 'brak'}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('cards')} className={`px-2.5 py-1 rounded text-xs ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'border border-[#2f3b57] text-[#cbd5e1]'}`}>Kafelki</button>
            <button onClick={() => setViewMode('list')} className={`px-2.5 py-1 rounded text-xs ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'border border-[#2f3b57] text-[#cbd5e1]'}`}>Lista</button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7f8ea9]" size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj ofert, miasta, ulicy..."
              className="w-full pl-9 pr-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]"
            />
          </div>

          <div className="hidden md:flex items-center gap-2">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filtr źródła" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
              <option value="all">Źródło</option>
              {sourceCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} title="Filtr typu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
              <option value="all">Typ</option>
              <option value="flat">Mieszkanie</option>
              <option value="house">Dom</option>
              <option value="plot">Działka</option>
              <option value="commercial">Lokal</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Filtr statusu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
              <option value="all">Status</option>
              <option value="new">new</option>
              <option value="active">active</option>
              <option value="updated">updated</option>
            </select>
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} title="Filtr regionu" className="px-2.5 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]">
              <option value="pomorskie">Pomorskie (domyślnie)</option>
              <option value="all">Cała Polska</option>
              {voivodeships.filter((v) => v !== 'pomorskie').map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
            </select>
          </div>

          <button onClick={() => setMobileFiltersOpen(true)} className="md:hidden inline-flex items-center justify-center gap-2 px-3 py-2 border border-[#2f3b57] rounded-lg text-sm text-[#cbd5e1] bg-[#0f172a]">
            <SlidersHorizontal size={16} /> Filtry
          </button>
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[#0f172a] border-t border-[#2f3b57] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e5e7eb]">Filtry</h3>
              <button onClick={() => setMobileFiltersOpen(false)} title="Zamknij filtry" className="p-2 rounded-lg text-[#9fb0cf]"><X size={16} /></button>
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filtr źródła" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Źródło</option>
              {sourceCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} title="Filtr typu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Typ</option>
              <option value="flat">Mieszkanie</option>
              <option value="house">Dom</option>
              <option value="plot">Działka</option>
              <option value="commercial">Lokal</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Filtr statusu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="all">Status</option>
              <option value="new">new</option>
              <option value="active">active</option>
              <option value="updated">updated</option>
            </select>
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} title="Filtr regionu" className="w-full px-3 py-2 border border-[#2f3b57] rounded-lg text-sm bg-[#111a2b] text-[#e5e7eb]">
              <option value="pomorskie">Pomorskie (domyślnie)</option>
              <option value="all">Cała Polska</option>
              {voivodeships.filter((v) => v !== 'pomorskie').map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setSourceFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setRegionFilter(DEFAULT_REGION) }} className="px-3 py-2 rounded-lg border border-[#2f3b57] text-[#cbd5e1]">Wyczyść</button>
              <button onClick={() => setMobileFiltersOpen(false)} className="px-3 py-2 rounded-lg bg-blue-600 text-white">Zastosuj</button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-8 text-sm text-[#94a3b8]">Ładowanie danych...</div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((item) => {
            const a = analyticsFor(item)
            const isOpportunity = a.belowPct >= 10
            return (
              <div key={item.id} className="bg-[#111a2b] border border-[#26324a] rounded-xl overflow-hidden hover:bg-[#18233a] transition-colors">
                <div className="h-40 bg-[#0f172a]">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Brak zdjęcia</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-medium text-[#e5e7eb] line-clamp-2">{item.title}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.cls}`}>{a.status}</span>
                  </div>
                  <p className="text-sm text-[#94a3b8]">{item.sourceName || item.sourceCode} • {item.city || '-'}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.propertyType ? <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#2f3b57] text-[#9fb0cf]">{item.propertyType}</span> : null}
                    {item.status ? <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#2f3b57] text-[#9fb0cf]">{item.status}</span> : null}
                  </div>

                  {isOpportunity ? (
                    <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">🔥 OKAZJA -{a.belowPct.toFixed(1)}%</p>
                  ) : null}

                  <div className="mt-2">
                    <p className="font-semibold text-[#f8fafc]">{formatMoney(Number(item.price || 0))}</p>
                    <p className="text-xs text-[#94a3b8]">
                      {formatMoney(a.ppm2)}/m² • średnia: {formatMoney(a.median)}/m²
                    </p>
                    {item.previousPrice && item.priceChangePct != null && item.priceChangePct < 0 ? (
                      <p className="text-xs text-red-500 mt-1">↓ z {formatMoney(item.previousPrice)} <span className="ml-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30">{item.priceChangePct.toFixed(1)}% cena</span></p>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleIngest(item.id)}
                      disabled={importingId === item.id}
                      className="text-xs px-2.5 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {importingId === item.id ? 'Import...' : 'Importuj do CRM'}
                    </button>
                    <button onClick={() => toggleObserved(item.id)} className="text-xs px-2.5 py-1.5 rounded border border-[#2f3b57] text-[#cbd5e1] hover:bg-[#18233a]">
                      {watchedIds.includes(item.id) ? 'Obserwowane' : 'Obserwuj'}
                    </button>
                    <button onClick={() => toggleCompare(item.id)} className="text-xs px-2.5 py-1.5 rounded border border-[#2f3b57] text-[#cbd5e1] hover:bg-[#18233a]">
                      {compareIds.includes(item.id) ? 'W porównaniu' : 'Porównaj'}
                    </button>
                  </div>

                  {item.sourceUrl ? (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      Otwórz źródło <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] divide-y divide-[#22304a]">
          {paginated.map((item) => {
            const a = analyticsFor(item)
            return (
              <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-16 h-12 bg-[#0f172a] rounded overflow-hidden shrink-0">
                    {item.images?.[0] ? <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#e5e7eb] truncate">{item.title}</p>
                    <p className="text-sm text-[#94a3b8] truncate">{item.sourceName || item.sourceCode} • {item.city || '-'} • {item.propertyType}</p>
                    <p className="text-xs text-[#94a3b8] truncate">{formatMoney(a.ppm2)}/m² • mediana {formatMoney(a.median)}/m²</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-[#f8fafc]">{formatMoney(Number(item.price || 0))}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.cls}`}>{a.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > 0 ? (
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-[#cbd5e1]">
            <span>Na stronę:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              title="Na stronę"
              className="px-2 py-1 border border-[#2f3b57] rounded-lg text-sm bg-[#0f172a] text-[#e5e7eb]"
            >
              {[2, 4, 6, 8, 15].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-[#94a3b8]">Strona {safePage} z {totalPages}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#2f3b57] text-[#cbd5e1] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#18233a]"
            >
              Poprzednia
            </button>
            {Array.from({ length: totalPages }).slice(0, 7).map((_, idx) => {
              const page = idx + 1
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 text-sm rounded-lg border ${safePage === page ? 'bg-blue-600 text-white border-blue-600' : 'border-[#2f3b57] text-[#cbd5e1] hover:bg-[#18233a]'}`}
                >
                  {page}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#2f3b57] text-[#cbd5e1] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#18233a]"
            >
              Następna
            </button>
          </div>
        </div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <div className="bg-[#111a2b] rounded-xl border border-[#26324a] p-12 text-center text-[#94a3b8]">
          Brak ofert spełniających filtry.
        </div>
      ) : null}
    </div>
  )
}

export default Marketplace
