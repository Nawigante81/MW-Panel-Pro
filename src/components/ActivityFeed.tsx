import { useState, useEffect, useMemo } from 'react'
import { Activity, Filter, User, Building2, FileText, CheckSquare, Target, Bell, Clock, TrendingUp, MessageSquare, RefreshCw } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useDataStore } from '../store/dataStore'

type ActivityItem = {
  id: string
  type: string
  displayName: string
  userEmail: string | null
  entityType: string
  entityId: string
  entityName: string
  description: string
  createdAt: string
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string; action: string }> = {
  client:   { icon: User,         color: 'text-(--accent-main)',  bg: 'bg-[#0f172a] border border-(--accent-main)/30', label: 'Klienci',        action: 'Zmiana klienta'   },
  property: { icon: Building2,    color: 'text-fuchsia-400',            bg: 'bg-[#0f172a] border border-fuchsia-400/30',          label: 'Nieruchomości',  action: 'Zmiana oferty'    },
  document: { icon: FileText,     color: 'text-cyan-400',               bg: 'bg-[#0f172a] border border-cyan-400/30',             label: 'Dokumenty',      action: 'Zmiana dokumentu' },
  task:     { icon: CheckSquare,  color: 'text-orange-400',             bg: 'bg-[#0f172a] border border-orange-400/30',           label: 'Zadania',        action: 'Zmiana zadania'   },
  lead:     { icon: Target,       color: 'text-rose-400',               bg: 'bg-[#0f172a] border border-rose-400/30',             label: 'Leady',          action: 'Zmiana leadu'     },
  note:     { icon: MessageSquare,color: 'text-teal-400',               bg: 'bg-[#0f172a] border border-teal-400/30',             label: 'Notatki',        action: 'Dodano notatkę'   },
  call:     { icon: Bell,         color: 'text-yellow-400',             bg: 'bg-[#0f172a] border border-yellow-400/30',           label: 'Rozmowy',        action: 'Rozmowa tel.'     },
  meeting:  { icon: Clock,        color: 'text-indigo-400',             bg: 'bg-[#0f172a] border border-indigo-400/30',           label: 'Spotkania',      action: 'Spotkanie'        },
}

const FALLBACK_CONFIG = { icon: Activity, color: 'text-[#9fb0c5]', bg: 'bg-[#0f172a] border border-[#2b3a57]', label: 'Aktywność', action: 'Aktywność' }

const FILTERS = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'lead', label: 'Leady' },
  { key: 'client', label: 'Klienci' },
  { key: 'property', label: 'Nieruchomości' },
  { key: 'document', label: 'Dokumenty' },
  { key: 'task', label: 'Zadania' },
  { key: 'call', label: 'Rozmowy' },
  { key: 'meeting', label: 'Spotkania' },
]

const USER_COLORS = [
  'bg-pink-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const getUserColor = (id: string) => USER_COLORS[id.charCodeAt(0) % USER_COLORS.length]

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'teraz'
  if (min < 60) return `${min} min temu`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} godz. temu`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} dni temu`
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-main) focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]'

export default function ActivityFeed() {
  const { getAgencyId } = useDataStore()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeUser, setActiveUser] = useState('Wszyscy')
  const [search, setSearch] = useState('')

  const loadActivities = async () => {
    try {
      setLoading(true)
      setError('')
      const agencyId = getAgencyId()
      const params = new URLSearchParams({ agencyId, limit: '100' })
      if (activeFilter !== 'all') params.set('type', activeFilter)
      const rows = await apiFetch<ActivityItem[]>(`/activities?${params.toString()}`)
      setItems(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać aktywności')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadActivities() }, [activeFilter])

  const uniqueUsers = useMemo(() => {
    const names = [...new Set(items.map(i => i.displayName || i.userEmail || i.id))]
    return ['Wszyscy', ...names]
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(a => {
      if (activeUser !== 'Wszyscy') {
        const name = a.displayName || a.userEmail || a.id
        if (name !== activeUser) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const hay = [a.entityName, a.description, a.displayName || '', a.userEmail || ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, activeUser, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    today: items.filter(a => a.createdAt.startsWith(today)).length,
    leads: items.filter(a => a.type === 'lead').length,
    documents: items.filter(a => a.type === 'document').length,
  }), [items, today])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">Feed Aktywności</h1>
        <p className="text-[#9fb0c5] mt-1">Historia wszystkich działań w systemie</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Wszystkie akcje', value: stats.total,     icon: Activity,    accent: 'text-(--accent-main)',  border: 'border-(--accent-main)/30' },
          { label: 'Dzisiaj',          value: stats.today,    icon: Clock,        accent: 'text-emerald-400',            border: 'border-emerald-400/30' },
          { label: 'Nowe leady',       value: stats.leads,    icon: TrendingUp,   accent: 'text-rose-400',               border: 'border-rose-400/30' },
          { label: 'Dokumenty',        value: stats.documents,icon: FileText,     accent: 'text-cyan-400',               border: 'border-cyan-400/30' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-lg border ${stat.border} bg-[#0f172a] p-4`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-[#111a2b] flex items-center justify-center border border-[#2b3a57]">
                <stat.icon size={18} className={stat.accent} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stat.accent}`}>{stat.value}</p>
                <p className="text-xs text-[#9fb0c5]">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${FOCUS_RING} ${
                activeFilter === f.key
                  ? 'bg-(--accent-main) text-[#0f172a] border-(--accent-main)'
                  : 'bg-[#111a2b] border-[#2b3a57] text-[#9fb0c5] hover:border-(--accent-main)/50 hover:text-[#f1f5f9]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj w aktywnościach..."
            className="flex-1 px-3 py-2 border border-[#2b3a57] rounded-md bg-[#111a2b] text-[#f1f5f9] placeholder-[#4a5f7a] text-sm focus:outline-none focus:ring-1 focus:ring-(--accent-main)"
          />
          <select
            value={activeUser}
            onChange={e => setActiveUser(e.target.value)}
            title="Filtr użytkownika"
            className="px-3 py-2 border border-[#2b3a57] rounded-md bg-[#111a2b] text-[#f1f5f9] text-sm focus:outline-none focus:ring-1 focus:ring-(--accent-main)"
          >
            {uniqueUsers.map(u => <option key={u}>{u}</option>)}
          </select>
          <button
            onClick={() => void loadActivities()}
            disabled={loading}
            className={`px-3 py-2 rounded-md border border-[#2b3a57] bg-[#111a2b] text-[#9fb0c5] hover:text-[#f1f5f9] hover:border-(--accent-main)/50 transition-colors ${FOCUS_RING}`}
            title="Odśwież"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Feed */}
      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] overflow-hidden">
        <div className="p-4 border-b border-[#2b3a57] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-(--accent-main)" />
            <h2 className="font-semibold text-[#f1f5f9]">Historia aktywności</h2>
            <span className="px-2 py-0.5 bg-(--accent-main)/10 text-(--accent-main) border border-(--accent-main)/30 rounded-full text-xs font-medium">{filtered.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-(--accent-main) rounded-full animate-pulse" />
            <span className="text-xs text-[#9fb0c5]">Na żywo</span>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="p-12 text-center">
            <RefreshCw size={32} className="text-(--accent-main) mx-auto mb-3 animate-spin" />
            <p className="text-[#9fb0c5]">Ładowanie aktywności...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Filter size={40} className="text-[#2b3a57] mx-auto mb-3" />
            <p className="text-[#9fb0c5]">{items.length === 0 ? 'Brak zarejestrowanych aktywności' : 'Brak aktywności dla wybranych filtrów'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e2d47]">
            {filtered.map((item, idx) => {
              const config = TYPE_CONFIG[item.type] ?? FALLBACK_CONFIG
              const Icon = config.icon
              const isToday = item.createdAt.startsWith(today)
              const displayName = item.displayName || item.userEmail || item.id
              const initials = getInitials(displayName)
              const userColor = getUserColor(item.id)
              return (
                <div key={item.id} className="flex gap-4 p-4 hover:bg-[#111a2b] transition-colors group">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${config.bg}`}>
                      <Icon size={18} className={config.color} />
                    </div>
                    {idx < filtered.length - 1 && (
                      <div className="w-px bg-[#1e2d47] flex-1 mt-2 min-h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${userColor}`}>
                          {initials}
                        </div>
                        <span className="text-sm font-semibold text-[#f1f5f9]">{displayName}</span>
                        <span className="text-sm text-[#9fb0c5]">{config.action}</span>
                        <span className={`text-sm font-medium ${config.color}`}>{item.entityName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isToday && <span className="px-1.5 py-0.5 bg-(--accent-main)/10 text-(--accent-main) border border-(--accent-main)/30 text-xs rounded">Dziś</span>}
                        <span className="text-xs text-[#4a5f7a]">{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                    {item.description && (
                      <div className="mt-1.5 ml-8 p-2 bg-[#111a2b] rounded-md border border-[#1e2d47]">
                        <p className="text-sm text-[#cbd5e1]">{item.description}</p>
                      </div>
                    )}
                    <div className="mt-1 ml-8 flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${config.bg} ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-[#4a5f7a]">{formatTime(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

