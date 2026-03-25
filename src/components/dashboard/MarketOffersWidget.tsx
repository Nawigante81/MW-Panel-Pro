import { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { apiFetch } from '../../utils/apiClient'

type MarketOffer = {
  id: string
  title?: string
  areaM2?: number
  city?: string
  price?: number
  firstSeenAt?: string
  sourceCode?: string
  sourceName?: string
  sourceUrl?: string
}

const sourceLabel = (item: MarketOffer) => {
  const raw = String(item?.sourceCode || item?.sourceName || '').toLowerCase()
  if (raw.includes('olx')) return 'OLX'
  if (raw.includes('otodom')) return 'Otodom'
  if (raw.includes('gratka')) return 'Gratka'
  return item?.sourceName || item?.sourceCode || 'Inne'
}

const formatPrice = (value: number | undefined | null) => {
  if (value == null) return '—'
  return `${Number(value).toLocaleString('pl-PL')} zł`
}

const formatArea = (value: number | undefined | null) => {
  if (value == null) return '—'
  return `${Number(value).toLocaleString('pl-PL')} m²`
}

const timeAgo = (iso?: string) => {
  if (!iso) return '—'
  const date = new Date(iso)
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}s temu`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m temu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h temu`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d temu`
}

const MarketOffersWidget = () => {
  const [offers, setOffers] = useState<MarketOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [watched, setWatched] = useState<Set<string>>(() => new Set())

  const loadOffers = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<MarketOffer[]>('/external-listings?onlyActive=1')
      const latest = (Array.isArray(data) ? data : [])
        .sort((a, b) => new Date(b.firstSeenAt || 0).getTime() - new Date(a.firstSeenAt || 0).getTime())
        .slice(0, 5)
      setOffers(latest)
    } catch {
      setOffers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOffers()
  }, [])

  const handleImport = async (id: string) => {
    try {
      setImportingId(id)
      await apiFetch(`/external-listings/${id}/ingest`, { method: 'POST' })
      await loadOffers()
    } catch {
      // intentionally silent to keep widget non-intrusive in dashboard
    } finally {
      setImportingId(null)
    }
  }

  const toggleWatched = (id: string) => {
    setWatched((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasData = useMemo(() => offers.length > 0, [offers])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white transition-colors duration-200">Nowe oferty z rynku</h2>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Ładowanie ofert...</p>
        ) : !hasData ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Brak nowych ofert.</p>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => (
              <div key={offer.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-white truncate">{offer.title || 'Bez tytułu'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {formatArea(offer.areaM2)} – {offer.city || 'Brak miasta'}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{formatPrice(offer.price)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Źródło: {sourceLabel(offer)} · dodano: {timeAgo(offer.firstSeenAt)}
                    </p>
                  </div>

                  {offer.sourceUrl ? (
                    <a
                      href={offer.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Link <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleImport(offer.id)}
                    disabled={importingId === offer.id}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {importingId === offer.id ? 'Importowanie...' : 'Importuj do CRM'}
                  </button>
                  <button
                    onClick={() => toggleWatched(offer.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {watched.has(offer.id) ? 'W obserwowanych' : 'Dodaj do obserwowanych'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MarketOffersWidget
