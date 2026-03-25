import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Badge,
  Edit,
  MoreVertical,
  Users,
  Building2,
  FileText,
  Trash2,
  X,
  Copy,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useDataStore } from '../store/dataStore'
import { apiFetch } from '../utils/apiClient'
import type { Agent } from '../types'

type AgentForm = {
  userId: string
  licenseNumber: string
  specialization: string
  commissionRate: string
  targetProperties: string
  targetClients: string
  status: 'active' | 'inactive' | 'on_leave'
}

const defaultForm: AgentForm = {
  userId: '',
  licenseNumber: '',
  specialization: '',
  commissionRate: '',
  targetProperties: '',
  targetClients: '',
  status: 'active',
}

const Agents = () => {
  const { getAgencyId } = useDataStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [items, setItems] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AgentForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)

  const loadAgents = async () => {
    try {
      setLoading(true)
      setError('')
      const agencyId = getAgencyId()
      const rows = await apiFetch<Agent[]>(`/agents?agencyId=${encodeURIComponent(agencyId)}`)
      setItems(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać agentów')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAgents()
  }, [])

  const filteredAgents = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return items.filter((agent) => {
      const haystack = [agent.userId, agent.licenseNumber || '', ...(agent.specialization || [])].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [items, searchTerm])

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-950/40 text-green-400',
      inactive: 'bg-[#16243d] text-[#9fb0c5]',
      on_leave: 'bg-yellow-950/40 text-yellow-400',
    }
    const labels = {
      active: 'Aktywny',
      inactive: 'Nieaktywny',
      on_leave: 'Na urlopie',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', styles[status as keyof typeof styles])}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(defaultForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (agent: Agent) => {
    setEditingId(agent.id)
    setForm({
      userId: agent.userId,
      licenseNumber: agent.licenseNumber || '',
      specialization: (agent.specialization || []).join(', '),
      commissionRate: agent.commissionRate != null ? String(agent.commissionRate) : '',
      targetProperties: agent.targetProperties != null ? String(agent.targetProperties) : '',
      targetClients: agent.targetClients != null ? String(agent.targetClients) : '',
      status: agent.status,
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(defaultForm)
  }

  const submit = async () => {
    if (!form.userId.trim()) {
      setError('User ID agenta jest wymagane')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setInfo('')
      const agencyId = getAgencyId()
      const payload = {
        userId: form.userId.trim(),
        agencyId,
        licenseNumber: form.licenseNumber.trim() || undefined,
        specialization: form.specialization.split(',').map((x) => x.trim()).filter(Boolean),
        commissionRate: form.commissionRate ? Number(form.commissionRate) : undefined,
        targetProperties: form.targetProperties ? Number(form.targetProperties) : undefined,
        targetClients: form.targetClients ? Number(form.targetClients) : undefined,
        status: form.status,
        stats: undefined,
      }

      if (editingId) {
        await apiFetch<Agent>(`/agents/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setInfo('Zapisano zmiany agenta.')
      } else {
        await apiFetch<Agent>('/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setInfo('Dodano nowego agenta.')
      }

      closeModal()
      await loadAgents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać agenta')
    } finally {
      setSubmitting(false)
    }
  }

  const removeAgent = async (id: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć agenta?')
    if (!confirmed) return
    try {
      setError('')
      await apiFetch(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setInfo('Agent usunięty.')
      await loadAgents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć agenta')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Agenci</h1>
          <p className="text-[#9fb0c5]">Zarządzaj zespołem agentów</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 px-4 py-2">
          <Plus size={20} /> Dodaj agenta
        </button>
      </div>

      {error && <div className="text-sm text-rose-400">{error}</div>}
      {info && <div className="text-sm text-(--accent-main)">{info}</div>}

      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9fb0c5]" size={20} />
          <input
            type="text"
            placeholder="Szukaj agenta..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] placeholder-[#9fb0c5] focus:outline-none focus:ring-2 focus:ring-(--accent-main)"
          />
        </div>
      </div>

      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111a2b] border-b border-[#2b3a57]">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Agent</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Licencja</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Specjalizacja</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Oferty/Klienci/Dok.</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-[#9fb0c5]">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="border-b border-[#1e2d45] hover:bg-[#111a2b] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#16243d] rounded-full flex items-center justify-center text-(--accent-main) font-bold text-lg">
                        {agent.userId.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-[#f1f5f9]">{agent.userId}</p>
                        <span className="flex items-center gap-1 text-sm text-[#9fb0c5]">
                          <Badge size={12} /> {agent.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#9fb0c5]">{agent.licenseNumber || '-'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#9fb0c5]">{agent.specialization?.join(', ') || '-'}</span>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(agent.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3 text-sm text-[#9fb0c5]">
                      <span className="flex items-center gap-1"><Building2 size={14} />{agent.stats?.listingsCount ?? 0}</span>
                      <span className="flex items-center gap-1"><Users size={14} />{agent.stats?.clientsCount ?? 0}</span>
                      <span className="flex items-center gap-1"><FileText size={14} />{agent.stats?.documentsCount ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(agent)} className="p-2 hover:bg-[#16243d] rounded-md text-(--accent-main)" title="Edytuj">
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => {
                          void navigator.clipboard?.writeText(agent.id)
                          setInfo(`Skopiowano ID agenta: ${agent.id}`)
                        }}
                        className="p-2 hover:bg-[#16243d] rounded-md text-[#9fb0c5]"
                        title="Więcej"
                      >
                        <MoreVertical size={18} />
                      </button>
                      <button onClick={() => void removeAgent(agent.id)} className="p-2 hover:bg-red-950/40 rounded-md text-rose-400" title="Usuń">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAgents.length === 0 && (
          <div className="p-12 text-center text-[#9fb0c5]">
            <Users size={48} className="mx-auto mb-4 text-[#2b3a57]" />
            <p>{loading ? 'Ładowanie agentów...' : 'Brak agentów spełniających kryteria wyszukiwania'}</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-xl bg-[#0f172a] rounded-lg border border-[#2b3a57] p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#f1f5f9]">{editingId ? 'Edytuj agenta' : 'Dodaj agenta'}</h2>
              <button onClick={closeModal} className="p-2 rounded hover:bg-[#16243d]" title="Zamknij">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[#9fb0c5]">User ID</label>
                <input value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))} title="User ID" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Nr licencji</label>
                <input value={form.licenseNumber} onChange={(e) => setForm((p) => ({ ...p, licenseNumber: e.target.value }))} title="Nr licencji" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Specjalizacja (CSV)</label>
                <input value={form.specialization} onChange={(e) => setForm((p) => ({ ...p, specialization: e.target.value }))} title="Specjalizacja" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Prowizja (%)</label>
                <input type="number" value={form.commissionRate} onChange={(e) => setForm((p) => ({ ...p, commissionRate: e.target.value }))} title="Prowizja (%)" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Target ofert</label>
                <input type="number" value={form.targetProperties} onChange={(e) => setForm((p) => ({ ...p, targetProperties: e.target.value }))} title="Target ofert" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Target klientów</label>
                <input type="number" value={form.targetClients} onChange={(e) => setForm((p) => ({ ...p, targetClients: e.target.value }))} title="Target klientów" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)" />
              </div>
              <div>
                <label className="text-sm text-[#9fb0c5]">Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as AgentForm['status'] }))} title="Status" className="mt-1 w-full px-3 py-2 border border-[#2b3a57] rounded-md bg-[#0c1524] text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-(--accent-main)">
                  <option value="active">Aktywny</option>
                  <option value="inactive">Nieaktywny</option>
                  <option value="on_leave">Na urlopie</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 border border-[#2b3a57] rounded-md text-[#9fb0c5] hover:bg-[#16243d]">Anuluj</button>
              <button onClick={() => void submit()} disabled={submitting} className="btn-primary px-4 py-2 disabled:opacity-60 inline-flex items-center gap-2">
                <Copy size={14} /> {submitting ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Agents

