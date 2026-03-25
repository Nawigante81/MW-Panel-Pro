import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { MapPin } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { ExternalListing } from '../types'

const DEFAULT_CENTER: [number, number] = [52.2297, 21.0122]
const GEO_CACHE_KEY = 'mwpanel-map-geocode-cache-v1'

const CITY_CENTERS: Record<string, [number, number]> = {
  warszawa: [52.2297, 21.0122], krakow: [50.0647, 19.945], wroclaw: [51.1079, 17.0385],
  gdansk: [54.352, 18.6466], poznan: [52.4064, 16.9252], lodz: [51.7592, 19.455],
  lublin: [51.2465, 22.5684], szczecin: [53.4285, 14.5528], bydgoszcz: [53.1235, 18.0084],
  bialystok: [53.1325, 23.1688], katowice: [50.2649, 19.0238], gdynia: [54.5189, 18.5305],
  czestochowa: [50.8118, 19.1203], radom: [51.4027, 21.1471], torun: [53.0138, 18.5984],
  kielce: [50.8661, 20.6286], rzeszow: [50.0413, 21.999], olsztyn: [53.7784, 20.4801],
  opole: [50.6751, 17.9213], zielonagora: [51.9355, 15.5062],
}

const normCity = (v?: string) =>
  (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()

const detectCityCenter = (item: ExternalListing): [number, number] | null => {
  const direct = CITY_CENTERS[normCity(item.city)]
  if (direct) return direct
  const hay = `${item.locationText || ''} ${item.title || ''} ${item.district || ''} ${item.city || ''}`
  const h = normCity(hay)
  for (const [key, center] of Object.entries(CITY_CENTERS)) if (h.includes(key)) return center
  return null
}

const pseudoOffsetFromText = (seedText: string) => {
  const text = String(seedText || '')
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const n = Math.abs(h >>> 0)
  const radius = 0.002 + (n % 1600) / 100000
  const angle = ((n % 360) * Math.PI) / 180
  return { lat: Math.sin(angle) * radius, lng: Math.cos(angle) * radius }
}

const withCityFallback = (item: ExternalListing): ExternalListing => {
  if (typeof item.latitude === 'number' && typeof item.longitude === 'number') return item
  const center = detectCityCenter(item)
  if (!center) return item
  const seed = `${item.locationText || ''}|${item.title || ''}|${item.district || ''}|${item.sourceListingId || item.id}`
  const offset = pseudoOffsetFromText(seed)
  return { ...item, latitude: center[0] + offset.lat, longitude: center[1] + offset.lng }
}

const formatPrice = (price?: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(Number(price || 0))

const typeLabel = (type: ExternalListing['propertyType']) =>
  type === 'flat' ? 'Mieszkanie' : type === 'house' ? 'Dom' : type === 'plot' ? 'Działka' : 'Lokal'

const markerIcon = (price: number) =>
  L.divIcon({
    className: 'price-marker',
    html: `<div style="background:#0f172a;color:#fff;border:2px solid #fff;border-radius:9999px;padding:4px 8px;font-size:12px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,0.25);white-space:nowrap;">${price >= 1000000 ? `${(price / 1000000).toFixed(2)}M` : `${Math.round(price / 1000)}k`} PLN</div>`,
    iconSize: [92, 28],
    iconAnchor: [46, 30],
  })

export default function PropertyMap() {
  const [items, setItems] = useState<ExternalListing[]>([])
  const [loading, setLoading] = useState(true)
  const [gpsOnly, setGpsOnly] = useState(false)
  const [geoCache, setGeoCache] = useState<Record<string, { lat: number; lng: number }>>({})

  const load = async () => {
    try {
      const data = await apiFetch<ExternalListing[]>('/external-listings?onlyActive=1')
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GEO_CACHE_KEY)
      if (raw) setGeoCache(JSON.parse(raw))
    } catch {}
    void load()
    const id = setInterval(() => void load(), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false

    const geocodeOne = async (id: string, query: string) => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!response.ok) return null
        const json = (await response.json()) as Array<{ lat: string; lon: string }>
        if (!json?.[0]) return null
        return { id, lat: Number(json[0].lat), lng: Number(json[0].lon) }
      } catch {
        return null
      }
    }

    const run = async () => {
      const missing = items.filter((i) => {
        const hasReal = typeof i.latitude === 'number' && typeof i.longitude === 'number'
        return !hasReal && !geoCache[i.id]
      }).slice(0, 40)

      const updates: Record<string, { lat: number; lng: number }> = {}
      for (const item of missing) {
        if (cancelled) return
        const candidates = [
          [item.locationText, item.city, item.district].filter(Boolean).join(', '),
          [item.title, item.city, item.district].filter(Boolean).join(', '),
          [item.city, item.district].filter(Boolean).join(', '),
          item.locationText || '',
          item.title || '',
        ].map((q) => q.trim()).filter(Boolean)

        let resolved: { id: string; lat: number; lng: number } | null = null
        for (const query of candidates) {
          resolved = await geocodeOne(item.id, query)
          if (resolved && Number.isFinite(resolved.lat) && Number.isFinite(resolved.lng)) break
          await new Promise((r) => setTimeout(r, 250))
        }

        if (resolved && Number.isFinite(resolved.lat) && Number.isFinite(resolved.lng)) {
          updates[resolved.id] = { lat: resolved.lat, lng: resolved.lng }
        }

        await new Promise((r) => setTimeout(r, 650))
      }

      if (cancelled || Object.keys(updates).length === 0) return
      setGeoCache((prev) => {
        const next = { ...prev, ...updates }
        try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(next)) } catch {}
        return next
      })
    }

    void run()
    return () => { cancelled = true }
  }, [items])

  const mapped = useMemo(() => {
    const enriched = items.map((i) => {
      if (typeof i.latitude === 'number' && typeof i.longitude === 'number') return i
      const cached = geoCache[i.id]
      if (cached) return { ...i, latitude: cached.lat, longitude: cached.lng }
      return gpsOnly ? i : withCityFallback(i)
    })

    return enriched.filter(
      (i) => typeof i.latitude === 'number' && typeof i.longitude === 'number' && Number.isFinite(i.latitude) && Number.isFinite(i.longitude)
    )
  }, [items, gpsOnly, geoCache])

  const center: [number, number] = mapped.length > 0 ? [Number(mapped[0].latitude), Number(mapped[0].longitude)] : DEFAULT_CENTER

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <MapPin className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          Mapa ofert (zewnętrzne źródła)
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Na mapie: {mapped.length} / {items.length} ofert (aktualizacja co 30s)</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 gap-1">
            <button onClick={() => setGpsOnly(true)} className={`px-3 py-1.5 rounded-md text-sm ${gpsOnly ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>Tylko dokładne GPS</button>
            <button onClick={() => setGpsOnly(false)} className={`px-3 py-1.5 rounded-md text-sm ${!gpsOnly ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>Przybliżenie po mieście</button>
          </div>
          <button
            onClick={() => {
              try { localStorage.removeItem(GEO_CACHE_KEY) } catch {}
              setGeoCache({})
              void load()
            }}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Odśwież geolokalizację
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        {loading ? <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Ładowanie mapy...</p> : null}
        {!loading && mapped.length === 0 ? <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Brak ofert do wyświetlenia w bieżącym trybie mapy.</p> : null}
        <MapContainer center={center} zoom={6} style={{ height: 640, width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {mapped.map((offer) => (
            <Marker key={offer.id} position={[Number(offer.latitude), Number(offer.longitude)]} icon={markerIcon(Number(offer.price || 0))}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{typeLabel(offer.propertyType)}</p>
                  <p>{offer.city || 'Nieznane miasto'}</p>
                  <p className="font-bold text-blue-700">{formatPrice(offer.price)}</p>
                  {offer.sourceUrl ? (
                    <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
                      Przejdź do źródła ogłoszenia
                    </a>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
