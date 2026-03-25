import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'
import { apiFetch, apiJsonFetch } from '../utils/apiClient'

type Transaction = {
  id: string
  agencyId: string
  title: string
  status: string
  parties: Record<string, unknown>
  milestones: Record<string, unknown>
  paymentStatus: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

const STAGES = [
  { id: 'lead', label: 'Nowy Lead', color: 'bg-gray-500', light: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { id: 'contact', label: 'Kontakt', color: 'bg-blue-500', light: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { id: 'presentation', label: 'Prezentacja', color: 'bg-yellow-500', light: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { id: 'offer', label: 'Oferta', color: 'bg-orange-500', light: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { id: 'negotiation', label: 'Negocjacje', color: 'bg-purple-500', light: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { id: 'contract', label: 'Umowa', color: 'bg-indigo-500', light: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { id: 'closed', label: 'Zamknięta', color: 'bg-green-500', light: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
]

const Pipeline = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newStage, setNewStage] = useState('lead')
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const agencyId = useAuthStore((state) => state.agency?.id || 'agency-1')

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<Transaction[]>(`/transactions?agencyId=${encodeURIComponent(agencyId)}`)
      setTransactions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać pipeline')
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  const byStage = useMemo(() => {
    const map: Record<string, Transaction[]> = {}
    STAGES.forEach((stage) => {
      map[stage.id] = transactions.filter((t) => t.status === stage.id)
    })
    return map
  }, [transactions])

  const totals = useMemo(() => {
    const active = transactions.filter((t) => t.status !== 'closed').length
    const closed = transactions.filter((t) => t.status === 'closed').length
    return { all: transactions.length, active, closed }
  }, [transactions])

  const createTransaction = async () => {
    if (!newTitle.trim()) return
    try {
      const created = await apiJsonFetch<Transaction>('/transactions', { method: 'POST' }, {
        agencyId,
        title: newTitle.trim(),
        status: newStage,
        parties: {},
        milestones: {},
        paymentStatus: {},
      })
      setTransactions((prev) => [created, ...prev])
      setNewTitle('')
      setNewStage('lead')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć transakcji')
    }
  }

  const moveTransaction = async (id: string, stage: string) => {
    const current = transactions.find((t) => t.id === id)
    if (!current || current.status === stage) return
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status: stage } : t)))
    try {
      const updated = await apiJsonFetch<Transaction>(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH' }, { status: stage })
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)))
    } catch (err) {
      setTransactions((prev) => prev.map((t) => (t.id === id ? current : t)))
      setError(err instanceof Error ? err.message : 'Nie udało się przenieść transakcji')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipeline Transakcji</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Spójny przepływ etapów oparty o backend</p>
        </div>
        <ContextHelpButton help={getContextHelp('/pipeline')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400"><TrendingUp size={18} /> Wszystkie</div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totals.all}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400"><Clock size={18} /> Aktywne</div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totals.active}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400"><CheckCircle size={18} /> Zamknięte</div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totals.closed}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid md:grid-cols-3 gap-3">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Tytuł nowej transakcji" />
          <div className="flex gap-2">
            <select value={newStage} onChange={(e) => setNewStage(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" title="Etap startowy">
              {STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.label}</option>
              ))}
            </select>
            <button onClick={() => void createTransaction()} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              <Plus size={16} />
              Dodaj
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} /> {error}</div> : null}
      {loading ? <p className="text-gray-500 dark:text-gray-400">Ładowanie...</p> : null}

      <div className="space-y-4 pb-4">
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggingId) {
                void moveTransaction(draggingId, stage.id)
                setDraggingId(null)
              }
            }}
          >
            <div className="p-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{stage.label}</h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">{byStage[stage.id]?.length || 0}</span>
              </div>
            </div>
            <div className="p-3 space-y-2 min-h-16">
              {(byStage[stage.id] || []).map((tx) => (
                <div
                  key={tx.id}
                  draggable
                  onDragStart={() => setDraggingId(tx.id)}
                  className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 cursor-grab"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{tx.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(tx.updatedAt).toLocaleDateString('pl-PL')}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {STAGES.filter((s) => s.id !== tx.status).slice(0, 2).map((next) => (
                      <button key={next.id} onClick={() => void moveTransaction(tx.id, next.id)} className={`text-xs px-2 py-1 rounded ${next.light}`}>
                        {next.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {(byStage[stage.id] || []).length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Brak transakcji na tym etapie.</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Pipeline
