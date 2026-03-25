import { AlertTriangle, Eye, RefreshCw } from 'lucide-react'
import { getSourceRecommendations, getSourceRiskScore, formatDateTime } from './utils'
import type { SourceSummaryItem } from './types'

type Props = {
  items: SourceSummaryItem[]
  selectedSourceId: string | null
  sourceActionLoadingId: string | null
  sourcesSortMode: 'risk' | 'name' | 'successRate' | 'failed' | 'partial'
  setSourcesSortMode: (value: 'risk' | 'name' | 'successRate' | 'failed' | 'partial') => void
  setSelectedSourceId: (value: string | null | ((prev: string | null) => string | null)) => void
  runSourceImport: (sourceId: string) => Promise<void>
  goToErrors: (sourceCode: string) => void
  focusRing: string
}

export default function SourcesCockpit({ items, selectedSourceId, sourceActionLoadingId, sourcesSortMode, setSourcesSortMode, setSelectedSourceId, runSourceImport, goToErrors, focusRing }: Props) {
  return (
    <div className="rounded-xl border border-[#22314d] bg-[#0b1220] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[#1e2d45] flex-wrap">
        <div>
          <p className="text-sm font-semibold text-[#f1f5f9]">Cockpit źródeł importu</p>
          <p className="text-xs text-[#7f90ab]">Porównanie skuteczności, partial importów i ostatnich synców per źródło</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[#7f90ab]">Sortuj:</span>
          <button type="button" onClick={() => setSourcesSortMode('risk')} className={`px-2.5 py-1 rounded text-xs border ${sourcesSortMode === 'risk' ? 'border-rose-500/40 text-rose-300 bg-rose-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Ryzyko</button>
          <button type="button" onClick={() => setSourcesSortMode('failed')} className={`px-2.5 py-1 rounded text-xs border ${sourcesSortMode === 'failed' ? 'border-red-500/40 text-red-300 bg-red-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Failed</button>
          <button type="button" onClick={() => setSourcesSortMode('partial')} className={`px-2.5 py-1 rounded text-xs border ${sourcesSortMode === 'partial' ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Partial</button>
          <button type="button" onClick={() => setSourcesSortMode('successRate')} className={`px-2.5 py-1 rounded text-xs border ${sourcesSortMode === 'successRate' ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Success %</button>
          <button type="button" onClick={() => setSourcesSortMode('name')} className={`px-2.5 py-1 rounded text-xs border ${sourcesSortMode === 'name' ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10' : 'border-[#2f3b57] text-[#cbd5e1]'}`}>Nazwa</button>
        </div>
      </div>
      <div className="hidden xl:grid grid-cols-[1.1fr_110px_90px_90px_120px_150px_1.2fr_220px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-[#7f90ab] border-b border-[#1e2d45]">
        <span>Źródło</span>
        <span>Health</span>
        <span>Success 24h</span>
        <span>Failed 24h</span>
        <span>Partial oferty</span>
        <span>Ostatni sync</span>
        <span>Rekomendacja</span>
        <span>Akcje</span>
      </div>
      <div className="divide-y divide-[#1e2d45]">
        {items.map((item) => {
          const recommendations = getSourceRecommendations(item)
          return (
            <div key={item.source.id} className="grid xl:grid-cols-[1.1fr_110px_90px_90px_120px_150px_1.2fr_220px] gap-3 px-3 py-3 items-start">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[#f1f5f9]">{item.source.name}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2f3b57] text-[#9fb0cf]">risk {getSourceRiskScore(item)}</span>
                </div>
                <p className="text-[11px] text-[#7f90ab]">{item.source.code} · aktywne oferty: {item.listings.active}/{item.listings.total}</p>
              </div>
              <div>
                <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${item.source.health === 'error' ? 'border-red-500/40 text-red-300 bg-red-500/10' : item.source.health === 'warning' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : item.source.health === 'ok' ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-[#2f3b57] text-[#94a3b8]'}`}>{item.source.health || 'idle'}</span>
              </div>
              <div className="text-sm text-emerald-300 tabular-nums">{item.stats24h.successRate24h != null ? `${item.stats24h.successRate24h}%` : '—'}</div>
              <div className="text-sm text-red-300 tabular-nums">{item.stats24h.failed}</div>
              <div className="text-sm text-violet-300 tabular-nums">{item.listings.partial}</div>
              <div className="text-sm text-[#cbd5e1]">{formatDateTime(item.source.lastSyncAt)}</div>
              <div className="space-y-1.5">
                {recommendations.map((rec, idx) => (
                  <div key={`${item.source.id}-rec-${idx}`} className={`text-[11px] rounded-md px-2 py-1.5 border ${rec.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : rec.tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'}`}>
                    {rec.text}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedSourceId((prev) => prev === item.source.id ? null : item.source.id)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] ${selectedSourceId === item.source.id ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' : 'border-[#2f3b57] text-[#cbd5e1] hover:bg-[#16243d]'} ${focusRing}`}><Eye size={12} /> Diagnostyka</button>
                <button type="button" onClick={() => void runSourceImport(item.source.id)} disabled={sourceActionLoadingId === item.source.id || item.source.isActive === false} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] ${item.source.isActive === false ? 'border-[#2f3b57] text-[#64748b] cursor-not-allowed' : 'border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10'} ${focusRing}`}><RefreshCw size={12} className={sourceActionLoadingId === item.source.id ? 'animate-spin' : ''} /> Importuj</button>
                <button type="button" onClick={() => goToErrors(item.source.code)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 ${focusRing}`}><AlertTriangle size={12} /> Błędy</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
