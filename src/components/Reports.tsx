import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, BarChart3, Download, Users, Building2, FileText, Target, DollarSign, AlertCircle, RefreshCw } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useDataStore } from '../store/dataStore'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'

type KPI = {
  activeListings: number
  portfolioValue: number
  newListings: number
  soldListings: number
  newLeads: number
  totalClients: number
  totalTransactions: number
}

type MonthCount = { month: string; cnt: number }
type ActivityRow = { type?: string; cnt: number }
type AgentRow = { user_id: string; name: string; activity_count: number }
type StatusRow = { status: string; cnt: number }
type PropRow = { property_type?: string; cnt: number }

type ReportData = {
  period: number
  kpi: KPI
  activityByType: ActivityRow[]
  monthlyLeads: MonthCount[]
  monthlyListings: MonthCount[]
  agentActivity: AgentRow[]
  propertiesByType: PropRow[]
  leadsByStatus: StatusRow[]
}

const PERIOD_DAYS: Record<string, number> = { '7 dni': 7, '30 dni': 30, '90 dni': 90, 'Ten rok': 365 }

const PROP_LABELS: Record<string, string> = {
  apartment: 'Mieszkania', house: 'Domy', plot: 'Dzialki',
  commercial: 'Lokale', office: 'Biura', warehouse: 'Magazyny', other: 'Inne',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowe', contacted: 'Skontaktowany', qualified: 'Zakwalifikowany',
  proposal: 'Propozycja', won: 'Wygrany', lost: 'Stracony',
}

const fmtPLN = (v: number) => v >= 1_000_000
  ? `${(v / 1_000_000).toFixed(2)} M zl`
  : v >= 1000 ? `${(v / 1000).toFixed(0)} K zl` : `${v} zl`

const monthLabel = (m: string) => {
  try { return new Date(m + '-01').toLocaleDateString('pl-PL', { month: 'short' }) }
  catch { return m.slice(5) }
}

const maxOf = (arr: number[]) => Math.max(1, ...arr)

function BarChart({ data, color }: { data: { x: string; y: number }[]; color: string }) {
  const max = maxOf(data.map(d => d.y))
  return (
    <div className="flex items-end gap-2 h-36">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[10px] text-[#9fb0c5]">{d.y}</span>
          <div className="w-full flex-1 relative">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <rect
                x="0"
                y={100 - (d.y > 0 ? Math.max((d.y / max) * 100, 3) : 0)}
                width="100"
                height={d.y > 0 ? Math.max((d.y / max) * 100, 3) : 0}
                rx="4"
                className={`${color} transition-all`}
              />
            </svg>
          </div>
          <span className="text-[10px] text-[#9fb0c5] truncate w-full text-center">{d.x}</span>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const { getAgencyId } = useDataStore()
  const [period, setPeriod] = useState('30 dni')
  const [tab, setTab] = useState<'overview' | 'agents' | 'properties'>('overview')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async (p: string) => {
    try {
      setLoading(true)
      setError('')
      const agencyId = getAgencyId()
      const days = PERIOD_DAYS[p] ?? 30
      const result = await apiFetch<ReportData>(
        `/reports/summary?agencyId=${encodeURIComponent(agencyId)}&days=${days}`
      )
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad ladowania raportu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(period) }, [period])

  const handleExport = () => {
    if (!data) return
    const rows: (string | number)[][] = [
      ['Miesiac', 'Nowe leady', 'Nowe oferty'],
      ...data.monthlyLeads.map((ml, i) => [
        monthLabel(ml.month), ml.cnt, data.monthlyListings[i]?.cnt ?? 0,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `raport_mwpanel_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kpi = data?.kpi
  const kpiCards = [
    { label: 'Aktywne oferty', value: String(kpi?.activeListings ?? '--'), change: `+${kpi?.newListings ?? 0} nowe`, up: true, icon: Building2 },
    { label: 'Wartosc portfela', value: kpi ? fmtPLN(kpi.portfolioValue) : '--', change: `${kpi?.soldListings ?? 0} sprzedane`, up: true, icon: DollarSign },
    { label: 'Nowe leady', value: String(kpi?.newLeads ?? '--'), change: `${kpi?.totalClients ?? 0} klientow`, up: true, icon: Target },
    { label: 'Transakcje', value: String(kpi?.totalTransactions ?? '--'), change: `${kpi?.soldListings ?? 0} w tym okr.`, up: (kpi?.soldListings ?? 0) > 0, icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Raporty i analizy</h1>
          <p className="text-[#9fb0c5] mt-1">Dane operacyjne agencji w jednym miejscu</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/raporty')} />
          <div className="flex bg-[#111a2b] border border-[#2b3a57] rounded-lg p-1">
            {Object.keys(PERIOD_DAYS).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p
                    ? 'bg-(--accent-main) text-[#0f172a] shadow-sm'
                    : 'text-[#9fb0c5] hover:text-[#f1f5f9]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load(period)}
            disabled={loading}
            title="Odswiez"
            className="p-2 border border-[#2b3a57] rounded-md text-[#9fb0c5] hover:bg-[#16243d] disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={!data}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm border border-rose-900/50 bg-rose-950/30 rounded-md px-3 py-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <div key={k.label} className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#16243d] flex items-center justify-center">
                <k.icon size={20} className="text-(--accent-main)" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                k.up ? 'bg-green-950/40 text-green-400' : 'bg-red-950/40 text-rose-400'
              }`}>
                {k.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {k.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#f1f5f9]">{loading ? '...' : k.value}</p>
            <p className="text-sm text-[#9fb0c5] mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-[#111a2b] p-1 rounded-lg border border-[#2b3a57]">
        {([
          { key: 'overview', label: 'Przeglad', icon: BarChart3 },
          { key: 'agents', label: 'Agenci', icon: Users },
          { key: 'properties', label: 'Nieruchomosci', icon: Building2 },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-[#0f172a] text-(--accent-main) shadow-sm'
                : 'text-[#9fb0c5] hover:text-[#f1f5f9]'
            }`}
          >
            <t.icon size={16} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#f1f5f9]">Nowe leady / mies.</h3>
                  <p className="text-sm text-[#9fb0c5]">Ostatnie 6 miesiecy</p>
                </div>
                  <Target size={20} className="text-(--accent-main)" />
              </div>
              {data && data.monthlyLeads.length > 0 ? (
                <BarChart
                  data={data.monthlyLeads.map(d => ({ x: monthLabel(d.month), y: d.cnt }))}
                    color="fill-(--accent-main)"
                />
              ) : (
                <p className="text-[#9fb0c5] text-sm text-center py-8">{loading ? 'Ladowanie...' : 'Brak danych'}</p>
              )}
            </div>

            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#f1f5f9]">Nowe oferty / mies.</h3>
                  <p className="text-sm text-[#9fb0c5]">Ostatnie 6 miesiecy</p>
                </div>
                <Building2 size={20} className="text-blue-400" />
              </div>
              {data && data.monthlyListings.length > 0 ? (
                <BarChart
                  data={data.monthlyListings.map(d => ({ x: monthLabel(d.month), y: d.cnt }))}
                  color="bg-blue-500"
                />
              ) : (
                <p className="text-[#9fb0c5] text-sm text-center py-8">{loading ? 'Ladowanie...' : 'Brak danych'}</p>
              )}
            </div>
          </div>

          {data && data.activityByType.length > 0 && (
            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[#f1f5f9]">Aktywnosc wg typu</h3>
                <FileText size={20} className="text-purple-400" />
              </div>
              <div className="space-y-2">
                {data.activityByType.map(a => {
                  const maxAct = maxOf(data.activityByType.map(x => x.cnt))
                  return (
                    <div key={a.type} className="flex items-center gap-3">
                      <span className="text-sm text-[#9fb0c5] w-24 truncate">{a.type ?? '--'}</span>
                      <progress
                        max={maxAct}
                        value={a.cnt}
                        title={`${a.type ?? '--'}: ${a.cnt}`}
                        className="flex-1 h-2 rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#111a2b] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-purple-500 [&::-moz-progress-bar]:bg-purple-500"
                      />
                      <span className="text-sm font-medium text-[#f1f5f9] w-8 text-right">{a.cnt}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data && data.leadsByStatus.length > 0 && (
            <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
              <h3 className="font-semibold text-[#f1f5f9] mb-4">Leady wg statusu</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.leadsByStatus.map(ls => (
                  <div key={ls.status} className="bg-[#111a2b] rounded-md p-3 border border-[#1e2d45]">
                    <p className="text-[#9fb0c5] text-xs">{STATUS_LABELS[ls.status] ?? ls.status}</p>
                    <p className="text-xl font-bold text-[#f1f5f9] mt-1">{ls.cnt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] overflow-hidden">
          <div className="p-4 border-b border-[#2b3a57] flex items-center gap-2">
            <Users size={18} className="text-(--accent-main)" />
            <h3 className="font-semibold text-[#f1f5f9]">Aktywnosc agentow</h3>
          </div>
          {data && data.agentActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#111a2b] border-b border-[#2b3a57]">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#9fb0c5] uppercase">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#9fb0c5] uppercase">Agent</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#9fb0c5] uppercase">Aktywnosci</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#9fb0c5] uppercase">Udzial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2d45]">
                  {data.agentActivity.map((agent, i) => {
                    const maxAct = maxOf(data.agentActivity.map(a => a.activity_count))
                    return (
                      <tr key={agent.user_id} className="hover:bg-[#111a2b] transition-colors">
                        <td className="px-4 py-4 text-sm text-[#9fb0c5]">{i + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#16243d] flex items-center justify-center text-(--accent-main) font-bold text-sm">
                              {(agent.name || agent.user_id)[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium text-[#f1f5f9]">{agent.name || agent.user_id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-[#f1f5f9]">{agent.activity_count}</td>
                        <td className="px-4 py-4">
                          <progress
                            max={maxAct}
                            value={agent.activity_count}
                            title={`${agent.name || agent.user_id}: ${agent.activity_count}`}
                            className="w-full h-2 rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#111a2b] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--accent-main) [&::-moz-progress-bar]:bg-(--accent-main)"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-[#9fb0c5]">
              <Users size={40} className="mx-auto mb-3 text-[#2b3a57]" />
              <p>{loading ? 'Ladowanie...' : 'Brak danych aktywnosci agentow'}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'properties' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
            <h3 className="font-semibold text-[#f1f5f9] mb-5">Struktura ofert wg typu</h3>
            {data && data.propertiesByType.length > 0 ? (
              <div className="space-y-4">
                {data.propertiesByType.map(pt => {
                  const total = data.propertiesByType.reduce((s, x) => s + x.cnt, 0)
                  const pct = total > 0 ? Math.round((pt.cnt / total) * 100) : 0
                  return (
                    <div key={pt.property_type}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-[#f1f5f9]">
                          {PROP_LABELS[pt.property_type ?? ''] ?? pt.property_type}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#9fb0c5]">{pt.cnt} ofert</span>
                          <span className="text-sm font-bold text-[#f1f5f9]">{pct}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-[#111a2b] rounded-full h-3">
                        <progress
                          max={100}
                          value={pct}
                          title={`${PROP_LABELS[pt.property_type ?? ''] ?? pt.property_type}: ${pct}%`}
                          className="w-full h-3 rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#111a2b] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--accent-main) [&::-moz-progress-bar]:bg-(--accent-main)"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[#9fb0c5] text-sm text-center py-8">{loading ? 'Ladowanie...' : 'Brak danych'}</p>
            )}
          </div>

          <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-6">
            <h3 className="font-semibold text-[#f1f5f9] mb-5">Statystyki operacyjne</h3>
            {kpi ? (
              <div className="space-y-3">
                {([
                  { label: 'Aktywne oferty', value: kpi.activeListings, icon: Building2, color: 'text-(--accent-main)' },
                  { label: 'Wartosc portfela', value: fmtPLN(kpi.portfolioValue), icon: DollarSign, color: 'text-green-400' },
                  { label: 'Nowe oferty', value: kpi.newListings, icon: TrendingUp, color: 'text-blue-400' },
                  { label: 'Sprzedane oferty', value: kpi.soldListings, icon: TrendingUp, color: 'text-yellow-400' },
                  { label: 'Nowe leady', value: kpi.newLeads, icon: Target, color: 'text-purple-400' },
                  { label: 'Klienci razem', value: kpi.totalClients, icon: Users, color: 'text-[#9fb0c5]' },
                  { label: 'Transakcje razem', value: kpi.totalTransactions, icon: FileText, color: 'text-orange-400' },
                ] as const).map(stat => (
                  <div key={stat.label} className="flex items-center justify-between p-3 bg-[#111a2b] rounded-md border border-[#1e2d45]">
                    <div className="flex items-center gap-3">
                      <stat.icon size={16} className={stat.color} />
                      <span className="text-sm text-[#9fb0c5]">{stat.label}</span>
                    </div>
                    <span className="font-bold text-[#f1f5f9]">{stat.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#9fb0c5] text-sm text-center py-8">{loading ? 'Ladowanie...' : 'Brak danych'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
