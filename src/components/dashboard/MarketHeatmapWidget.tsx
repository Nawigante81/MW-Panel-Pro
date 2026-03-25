import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../utils/apiClient'

type HeatCity = {
  city: string
  avg_price_per_m2: number
  median_price_per_m2: number
  offers_count: number
  opportunities_count: number
}

export default function MarketHeatmapWidget() {
  const [rows, setRows] = useState<HeatCity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<HeatCity[]>('/market-analytics/heatmap')
        setRows((data || []).slice(0, 5))
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="bg-[#111827] border border-[#1f2a44] rounded-xl backdrop-blur-sm bg-white/5 shadow-[0_6px_24px_rgba(2,6,23,0.35)]">
      <div className="p-3.5 border-b border-[#1f2a44] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e5e7eb]">Heatmapa cen</h3>
        <Link to="/mapa" className="text-xs text-[#9ca3af] hover:text-[#e5e7eb]">Zobacz mapę</Link>
      </div>
      <div className="p-3">
        {loading ? <div className="h-20 rounded-lg bg-[#0f172a] animate-pulse" /> : null}
        {!loading && rows.length === 0 ? <div className="rounded-lg border border-dashed border-[#2c3a57] p-3 text-xs text-[#9ca3af]">Brak danych do heatmapy.</div> : null}
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.city} className="rounded-lg border border-[#1f2a44] p-2.5 hover:bg-[#1f2937] transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#e5e7eb] capitalize">{r.city}</p>
                <p className="text-[11px] text-[#9ca3af] tabular-nums">{r.offers_count} ofert</p>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-[#9ca3af] tabular-nums">
                <p>Mediana: <span className="text-[#cbd5e1]">{Math.round(r.median_price_per_m2).toLocaleString('pl-PL')}</span> zł/m²</p>
                <p>Okazje: <span className="text-[#cbd5e1]">{r.opportunities_count}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
