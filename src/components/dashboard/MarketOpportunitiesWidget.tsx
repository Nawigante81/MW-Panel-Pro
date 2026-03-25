import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../utils/apiClient'

type Opportunity = {
  id: string
  title: string
  city: string
  price: number
  price_per_m2: number
  market_median_price_per_m2: number
  below_median_pct: number
  opportunity_level: 'opportunity' | 'strong_opportunity' | 'normal'
}

export default function MarketOpportunitiesWidget() {
  const [rows, setRows] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<Opportunity[]>('/market-analytics/opportunities?limit=5')
        setRows(data)
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const badgeCls = (level: Opportunity['opportunity_level']) =>
    level === 'strong_opportunity'
      ? 'bg-red-500/20 text-red-300 border-red-500/40'
      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'

  return (
    <div className="bg-[#111827] border border-[#1f2a44] rounded-xl backdrop-blur-sm bg-white/5 shadow-[0_6px_24px_rgba(2,6,23,0.35)]">
      <div className="p-3.5 border-b border-[#1f2a44] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e5e7eb]">Okazje z rynku</h3>
        <Link to="/market" className="text-xs text-[#9ca3af] hover:text-[#e5e7eb]">Zobacz wszystkie</Link>
      </div>
      <div className="p-3 space-y-2">
        {loading ? <div className="h-20 rounded-lg bg-[#0f172a] animate-pulse" /> : null}
        {!loading && rows.length === 0 ? <div className="rounded-lg border border-dashed border-[#2c3a57] p-3 text-xs text-[#9ca3af]">Brak okazji spełniających kryteria.</div> : null}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-[#1f2a44] p-2.5 hover:bg-[#1f2937] transition-colors">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#e5e7eb] truncate">{r.title}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeCls(r.opportunity_level)}`}>
                {r.opportunity_level === 'strong_opportunity' ? 'Mocna okazja' : 'Okazja'}
              </span>
            </div>
            <p className="text-[11px] text-[#9ca3af]">{r.city} · {Math.round(r.price).toLocaleString('pl-PL')} zł</p>
            <p className="text-[11px] text-[#9ca3af]">
              {Math.round(r.price_per_m2).toLocaleString('pl-PL')} zł/m² vs mediana {Math.round(r.market_median_price_per_m2).toLocaleString('pl-PL')} zł/m² ({r.below_median_pct.toFixed(1)}%)
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
