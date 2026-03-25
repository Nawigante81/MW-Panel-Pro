import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Bookmark, Plus, Eye, Link2Off, ImageOff, Check, UserPlus, UserCheck, Ban } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../utils/apiClient'
import { ExternalListing } from '../../types'

const SAVED_KEY = 'mw.market.saved-offers'
const IGNORED_KEY = 'mw.market.ignored-offers'
const REGION_KEY = 'mw.market.region-filter'
const DEFAULT_REGION = 'all'
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-main)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]'

const sourceLabel = (item: ExternalListing) => {
  const raw = `${item.sourceCode || item.sourceName || ''}`.toLowerCase()
  if (raw.includes('olx')) return 'OLX'
  if (raw.includes('otodom')) return 'Otodom'
  if (raw.includes('gratka')) return 'Gratka'
  return item.sourceName || item.sourceCode || 'Inne'
}

const formatPrice = (price?: number) => {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0) return 'Brak ceny'
  return `${Number(price).toLocaleString('pl-PL')} zł`
}

const shortDate = (iso?: string) => {
  if (!iso) return 'brak daty'
  const date = new Date(iso)
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMins < 1) return 'teraz'
  if (diffMins < 60) return `${diffMins}m`
  const hours = Math.floor(diffMins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const safeIds = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

type Props = { compactDefault?: boolean }

export default function MarketOffersCompactWidget({ compactDefault = true }: Props) {
  const [offers, setOffers] = useState<ExternalListing[]>([])
  const [loading, setLoading] = useState(true)
  const [compactMode, setCompactMode] = useState(compactDefault)
  const [savedIds, setSavedIds] = useState<string[]>(() => safeIds(SAVED_KEY))
  const [ignoredIds, setIgnoredIds] = useState<string[]>(() => safeIds(IGNORED_KEY))
  const [regionFilter, setRegionFilter] = useState<string>(() => localStorage.getItem(REGION_KEY) || DEFAULT_REGION)
  const [brokenImageIds, setBrokenImageIds] = useState<string[]>([])
  const [ingestingIds, setIngestingIds] = useState<string[]>([])
  const [importedIds, setImportedIds] = useState<string[]>([])
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<ExternalListing[]>('/external-listings?onlyActive=1')
        setOffers(Array.isArray(data) ? data : [])
      } catch {
        setOffers([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const voivodeships = useMemo(() => {
    const uniq = Array.from(new Set(offers.map((o) => (o.voivodeship || '').trim().toLowerCase()).filter(Boolean)))
    return uniq.sort((a, b) => a.localeCompare(b, 'pl'))
  }, [offers])

  useEffect(() => {
    localStorage.setItem(REGION_KEY, regionFilter)
  }, [regionFilter])

  const latest = useMemo(() => {
    return [...offers]
      .filter((x) => !ignoredIds.includes(x.id))
      .filter((x) => regionFilter === 'all' ? true : (x.voivodeship || '').trim().toLowerCase() === regionFilter)
      .sort((a, b) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime())
      .slice(0, compactMode ? 4 : 6)
  }, [offers, compactMode, ignoredIds, regionFilter])

  const persist = (key: string, ids: string[]) => localStorage.setItem(key, JSON.stringify(ids))

  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      persist(SAVED_KEY, next)
      return next
    })
  }

  const ignoreOffer = (id: string) => {
    setIgnoredIds((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      persist(IGNORED_KEY, next)
      return next
    })
  }

  const ingestToCrm = async (id: string) => {
    if (ingestingIds.includes(id)) return
    try {
      setActionError('')
      setIngestingIds((prev) => [...prev, id])
      await apiFetch(`/external-listings/${id}/ingest`, { method: 'POST' })
      setImportedIds((prev) => [...prev, id])
      setOffers((prev) => prev.filter((offer) => offer.id !== id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nie udało się dodać oferty do CRM')
    } finally {
      setIngestingIds((prev) => prev.filter((x) => x !== id))
    }
  }

  return (
    <div className="bg-[#111827] border border-[#2b3a57] rounded-xl shadow-[0_6px_24px_rgba(2,6,23,0.35)]">
      <div className="p-3.5 border-b border-[#2b3a57] flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold text-[#f1f5f9]">Monitoring rynku</h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className={`text-xs px-2 py-1 rounded border border-[#31425f] bg-[#0f172a] text-[#d2dceb] ${FOCUS_RING}`}
            aria-label="Filtr województwa"
          >
            <option value="all">Cała Polska</option>
            {voivodeships.map((v) => (
              <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
          <button onClick={() => setCompactMode((v) => !v)} className={`text-xs px-2 py-1 rounded border border-[#31425f] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`}>
            {compactMode ? 'Pokaż galerię' : 'Widok kompakt'}
          </button>
          <div className="flex items-center gap-2">
            <Link to="/nieruchomosci?import=partial" className={`text-xs text-amber-300 hover:text-amber-200 ${FOCUS_RING}`}>Dane częściowe w CRM</Link>
            <Link to="/market" className={`text-xs text-[#b7c3d4] hover:text-[#f1f5f9] ${FOCUS_RING}`}>Zobacz wszystkie</Link>
          </div>
        </div>
      </div>

      <div className="p-3.5">
        {actionError ? <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{actionError}</div> : null}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl border border-[#22304d] bg-[#0f172a] h-48 animate-pulse" />)}</div>
        ) : latest.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#3a4d70] p-4 text-sm text-[#c3cfdf] text-center">Brak nowych ofert rynkowych do analizy.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {latest.map((offer) => {
              const isSaved = savedIds.includes(offer.id)
              const hasImage = !!offer.images?.[0] && !brokenImageIds.includes(offer.id)

              return (
                <article key={offer.id} className="rounded-xl border border-[#2b3a57] overflow-hidden bg-[#0f172a] hover:border-[#3b5686] transition-all h-full flex flex-col">
                  {!compactMode && (
                    <div className="h-28 bg-[#0b1424] border-b border-[#2b3a57]">
                      {hasImage ? (
                        <img src={offer.images?.[0]} alt={offer.title} className="w-full h-full object-cover" loading="lazy" onError={() => setBrokenImageIds((prev) => [...prev, offer.id])} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center gap-2 text-[#7f8ea3] text-xs"><ImageOff size={14} />Brak miniatury</div>
                      )}
                    </div>
                  )}

                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <p className="text-sm font-medium text-[#f1f5f9] line-clamp-2">{offer.title || 'Bez tytułu'}</p>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold text-[#f1f5f9]">{formatPrice(offer.price)}</p>
                      <span className="text-[11px] text-[#b7c3d4] shrink-0">{shortDate(offer.firstSeenAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 min-h-5">
                      <span className="text-[11px] text-[#b7c3d4] truncate">{sourceLabel(offer)}</span>
                      {offer.sourceUrl ? <a href={offer.sourceUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 ${FOCUS_RING}`}>Źródło <ExternalLink size={10} /></a> : <span className="inline-flex items-center gap-1 text-[11px] text-[#7f8ea3]"><Link2Off size={10} />Brak linku</span>}
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1">
                      <button type="button" onClick={() => void ingestToCrm(offer.id)} disabled={ingestingIds.includes(offer.id) || importedIds.includes(offer.id)} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] disabled:opacity-60 ${FOCUS_RING}`}>
                        {importedIds.includes(offer.id) ? <><Check size={12} /> Dodano</> : ingestingIds.includes(offer.id) ? <><Plus size={12} /> Import...</> : <><Plus size={12} /> Dodaj do CRM</>}
                      </button>
                      <Link to={`/leads/new?externalId=${encodeURIComponent(offer.id)}`} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`}><UserPlus size={12} /> Utwórz lead</Link>
                      <Link to={`/klienci?assignExternal=${encodeURIComponent(offer.id)}`} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`}><UserCheck size={12} /> Przypisz</Link>
                      <button type="button" onClick={() => ignoreOffer(offer.id)} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#3f2c39] text-[#f5b4cc] hover:bg-[#3f2c39]/40 ${FOCUS_RING}`}><Ban size={12} /> Ignoruj</button>
                      <button type="button" onClick={() => toggleSave(offer.id)} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border transition-colors ${isSaved ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b]'} ${FOCUS_RING}`}><Bookmark size={12} /> {isSaved ? 'Zapisane' : 'Zapisz'}</button>
                      <Link to={`/market?focus=${encodeURIComponent(offer.id)}`} className={`inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#2b3b59] text-[#d2dceb] hover:bg-[#18243b] ${FOCUS_RING}`}><Eye size={12} /> Podgląd</Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
