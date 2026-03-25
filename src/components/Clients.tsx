import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Users,
  X,
  Copy,
  Upload,
  FileUp,
} from 'lucide-react'
import { ClientStatus, ClientType, type Client } from '../types'
import { cn } from '../utils/cn'
import { apiFetch } from '../utils/apiClient'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'
import { getRoleScopedPreference, setRoleScopedPreference } from '../utils/viewPreferences'

type ClientsListResponse = {
  items: Client[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type FormState = {
  assignedAgentId: string
  type: ClientType
  status: ClientStatus
  source: string
  notes: string
  propertiesCount: string
}

const defaultForm: FormState = {
  assignedAgentId: '',
  type: ClientType.BUYER,
  status: ClientStatus.ACTIVE,
  source: 'manual',
  notes: '',
  propertiesCount: '0',
}

const Clients = () => {
  const { getAgencyId } = useDataStore()
  const role = useAuthStore((s) => s.user?.role || 'agent')
  const [items, setItems] = useState<Client[]>([])
  const allColumns = [
    { key: 'client', label: 'Klient' },
    { key: 'agentSource', label: 'Agent/Źródło' },
    { key: 'notes', label: 'Notatki' },
    { key: 'type', label: 'Typ' },
    { key: 'status', label: 'Status' },
    { key: 'propertiesCount', label: 'Liczba ofert' },
    { key: 'actions', label: 'Akcje' },
  ] as const
  const defaultColumnsByRole: Record<string, string[]> = {
    agent: ['client', 'agentSource', 'status', 'actions'],
    manager: ['client', 'agentSource', 'type', 'status', 'propertiesCount', 'actions'],
    admin: ['client', 'agentSource', 'notes', 'type', 'status', 'propertiesCount', 'actions'],
  }
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    getRoleScopedPreference(role, 'clients.columns', defaultColumnsByRole[role] || defaultColumnsByRole.agent)
  )
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [submitting, setSubmitting] = useState(false)

  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importContent, setImportContent] = useState('')
  const [importFormat, setImportFormat] = useState<'xml' | 'csv'>('xml')
  const [importReport, setImportReport] = useState<{ imported: number; failed: number; total: number; format: string } | null>(null)

  const loadClients = async () => {
    try {
      setLoading(true)
      setError('')
      const agencyId = getAgencyId()
      const params = new URLSearchParams({
        agencyId,
        page: String(page),
        pageSize: String(pageSize),
      })
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      if (filterType !== 'all') params.set('type', filterType)
      if (filterStatus !== 'all') params.set('status', filterStatus)

      const payload = await apiFetch<ClientsListResponse>(`/clients/list?${params.toString()}`)
      setItems(payload.items || [])
      setTotal(payload.total || 0)
      setTotalPages(payload.totalPages || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać klientów')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setVisibleColumns(
      getRoleScopedPreference(role, 'clients.columns', defaultColumnsByRole[role] || defaultColumnsByRole.agent)
    )
  }, [role])

  useEffect(() => {
    setRoleScopedPreference(role, 'clients.columns', visibleColumns)
  }, [role, visibleColumns])

  useEffect(() => {
    void loadClients()
  }, [page, pageSize])

  useEffect(() => {
    setPage(1)
    const t = setTimeout(() => {
      void loadClients()
    }, 250)
    return () => clearTimeout(t)
  }, [searchTerm, filterType, filterStatus])

  const getTypeLabel = (type: string) => {
    switch (type) {
      case ClientType.BUYER:
        return 'Kupujący'
      case ClientType.SELLER:
        return 'Sprzedający'
      case ClientType.BOTH:
        return 'Kupujący i sprzedający'
      case ClientType.RENTER:
        return 'Najemca'
      case ClientType.LANDLORD:
        return 'Wynajmujący'
      default:
        return type
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      [ClientStatus.ACTIVE]: 'bg-green-100 text-green-800',
      [ClientStatus.INACTIVE]: 'bg-gray-100 text-gray-800',
      [ClientStatus.POTENTIAL]: 'bg-yellow-100 text-yellow-800',
      [ClientStatus.LEAD]: 'bg-blue-100 text-blue-800',
      [ClientStatus.ARCHIVED]: 'bg-slate-100 text-slate-800',
    }
    const labels = {
      [ClientStatus.ACTIVE]: 'Aktywny',
      [ClientStatus.INACTIVE]: 'Nieaktywny',
      [ClientStatus.POTENTIAL]: 'Potencjalny',
      [ClientStatus.LEAD]: 'Lead',
      [ClientStatus.ARCHIVED]: 'Archiwalny',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', styles[status as keyof typeof styles])}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  const openCreate = () => {
    setEditingClientId(null)
    setForm(defaultForm)
    setError('')
    setShowCreateModal(true)
  }

  const openEdit = (client: Client) => {
    setEditingClientId(client.id)
    setForm({
      assignedAgentId: client.assignedAgentId || '',
      type: client.type,
      status: client.status,
      source: client.source || 'manual',
      notes: client.notes || '',
      propertiesCount: String(client.propertiesCount || 0),
    })
    setError('')
    setShowCreateModal(true)
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingClientId(null)
    setForm(defaultForm)
  }

  const openImportModal = () => {
    setShowImportModal(true)
    setImportFileName('')
    setImportContent('')
    setImportFormat('xml')
    setImportReport(null)
    setError('')
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportFileName('')
    setImportContent('')
    setImportReport(null)
  }

  const handleImportFileChange = async (file?: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      setImportFileName(file.name)
      setImportContent(text)
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.csv')) {
        setImportFormat('csv')
      } else if (lower.endsWith('.xml')) {
        setImportFormat('xml')
      } else {
        setImportFormat(text.trim().startsWith('<') ? 'xml' : 'csv')
      }
    } catch {
      setError('Nie udało się odczytać pliku importu')
    }
  }

  const submitImport = async () => {
    if (!importContent.trim()) {
      setError('Wybierz plik XML/CSV do importu')
      return
    }

    try {
      setImporting(true)
      setError('')
      setInfo('')
      const agencyId = getAgencyId()
      const result = await apiFetch<{ imported: number; failed: number; total: number; format: string }>(`/clients/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId,
          format: importFormat,
          content: importContent,
          defaultType: ClientType.BUYER,
          defaultStatus: ClientStatus.ACTIVE,
          defaultSource: 'import-file',
        }),
      })

      setImportReport(result)
      setInfo(`Import zakończony: ${result.imported}/${result.total} rekordów dodanych.`)
      await loadClients()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zaimportować klientów')
    } finally {
      setImporting(false)
    }
  }

  const submitForm = async () => {
    try {
      setSubmitting(true)
      setError('')
      const agencyId = getAgencyId()

      const payload = {
        agencyId,
        assignedAgentId: form.assignedAgentId || undefined,
        type: form.type,
        status: form.status,
        source: form.source || undefined,
        notes: form.notes || undefined,
        propertiesCount: Number(form.propertiesCount || 0),
        tags: [],
      }

      if (editingClientId) {
        await apiFetch<Client>(`/clients/${encodeURIComponent(editingClientId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setInfo('Zapisano zmiany klienta.')
      } else {
        await apiFetch<Client>('/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setInfo('Dodano nowego klienta.')
      }

      closeModal()
      await loadClients()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać klienta')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć tego klienta?')
    if (!confirmed) return

    try {
      setError('')
      await apiFetch(`/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
      setInfo('Klient usunięty.')
      await loadClients()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć klienta')
    }
  }

  const filteredClients = useMemo(() => items, [items])
  const hasColumn = (key: string) => visibleColumns.includes(key)
  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Klienci</h1>
          <p className="text-gray-600 dark:text-gray-400">Zarządzaj bazą klientów agencji</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/klienci')} />
          <button
            onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Upload size={18} />
            Import z pliku
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-md transition-colors">
            <Plus size={20} />
            Dodaj klienta
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Szukaj klienta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            />
          </div>
          <div className="flex gap-4 relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              title="Filtr typu klienta"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <option value="all">Wszystkie typy</option>
              <option value={ClientType.BUYER}>Kupujący</option>
              <option value={ClientType.SELLER}>Sprzedający</option>
              <option value={ClientType.BOTH}>Obie strony</option>
              <option value={ClientType.RENTER}>Najemca</option>
              <option value={ClientType.LANDLORD}>Wynajmujący</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              title="Filtr statusu klienta"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <option value="all">Wszystkie statusy</option>
              <option value={ClientStatus.ACTIVE}>Aktywny</option>
              <option value={ClientStatus.INACTIVE}>Nieaktywny</option>
              <option value={ClientStatus.POTENTIAL}>Potencjalny</option>
              <option value={ClientStatus.LEAD}>Lead</option>
              <option value={ClientStatus.ARCHIVED}>Archiwalny</option>
            </select>
            <button
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
            >
              Kolumny
            </button>
            {showColumnsMenu && (
              <div className="absolute right-0 top-12 z-20 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
                <p className="text-xs mb-2 text-gray-500">Widoczne kolumny</p>
                <div className="space-y-1">
                  {allColumns.filter((c) => c.key !== 'actions').map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={hasColumn(col.key)} onChange={() => toggleColumn(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      {info && <div className="text-sm text-emerald-600 dark:text-emerald-400">{info}</div>}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {hasColumn('client') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Klient</th>}
                {hasColumn('agentSource') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Agent/Źródło</th>}
                {hasColumn('notes') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Notatki</th>}
                {hasColumn('type') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Typ</th>}
                {hasColumn('status') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Status</th>}
                {hasColumn('propertiesCount') && <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Liczba ofert</th>}
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                  {hasColumn('client') && (
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md flex items-center justify-center bg-(--accent-main)/15 border border-(--accent-main)/40 text-(--accent-main) font-semibold">
                        K
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">Klient #{client.id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Utworzono: {new Date(client.createdAt).toLocaleDateString('pl-PL')}</p>
                      </div>
                    </div>
                  </td>
                  )}
                  {hasColumn('agentSource') && (
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600 dark:text-gray-300">Agent: {client.assignedAgentId ?? 'Brak'}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Źródło: {client.source ?? 'Brak'}</p>
                    </div>
                  </td>
                  )}
                  {hasColumn('notes') && (
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{client.notes || 'Brak notatek'}</p>
                  </td>
                  )}
                  {hasColumn('type') && (
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-800 dark:text-gray-200">{getTypeLabel(client.type)}</span>
                  </td>
                  )}
                  {hasColumn('status') && <td className="px-6 py-4">{getStatusBadge(client.status)}</td>}
                  {hasColumn('propertiesCount') && (
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{client.propertiesCount}</span>
                  </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/klienci/${client.id}`} className="p-2 hover:bg-(--bg-elev) rounded-md text-(--accent-main) transition-colors duration-150" title="Szczegóły">
                        <Eye size={18} />
                      </Link>
                      <button onClick={() => openEdit(client)} className="p-2 hover:bg-(--bg-elev) rounded-md text-(--accent-main) transition-colors duration-150" title="Edytuj">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => void handleDeleteClient(client.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 transition-colors duration-200" title="Usuń">
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={() => {
                          void navigator.clipboard?.writeText(client.id)
                          setInfo(`Skopiowano ID klienta: ${client.id}`)
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 transition-colors duration-200"
                        title="Więcej"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredClients.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Users size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p>{loading ? 'Ładowanie klientów...' : 'Brak klientów spełniających kryteria wyszukiwania'}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
        <p>Pokazano {items.length} z {total} klientów</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors duration-200"
          >
            Poprzednia
          </button>
          <span className="px-3 py-1">Strona {page}/{totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors duration-200"
          >
            Następna
          </button>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import klientów z pliku</h2>
              <button onClick={closeImportModal} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Zamknij">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Obsługiwane formaty: <strong>XML</strong> i <strong>CSV</strong>. Plik może zawierać pola:
                <span className="font-mono text-xs"> fullName, email, phone, type, status, source, notes, propertiesCount, tags</span>
              </p>
              <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                <FileUp size={16} />
                Wybierz plik
                <input
                  type="file"
                  accept=".xml,.csv,.txt"
                  className="hidden"
                  onChange={(e) => void handleImportFileChange(e.target.files?.[0])}
                />
              </label>
              {importFileName ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Wybrano: {importFileName}</p>
              ) : null}
            </div>

            <div>
              <label className="text-sm text-gray-700 dark:text-gray-300">Wykryty format</label>
              <select
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as 'xml' | 'csv')}
                title="Wykryty format"
                className="mt-1 w-full px-3 py-2 border rounded-lg"
              >
                <option value="xml">XML</option>
                <option value="csv">CSV</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-700 dark:text-gray-300">Podgląd / zawartość pliku</label>
              <textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                rows={8}
                className="mt-1 w-full px-3 py-2 border rounded-lg font-mono text-xs"
                placeholder="Wklej XML/CSV albo wybierz plik"
              />
            </div>

            {importReport ? (
              <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/70 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                Import {importReport.format.toUpperCase()}: dodano {importReport.imported} z {importReport.total} rekordów, błędów: {importReport.failed}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button onClick={closeImportModal} className="px-4 py-2 border rounded-lg">Anuluj</button>
              <button onClick={() => void submitImport()} disabled={importing} className="btn-primary px-4 py-2 rounded-md disabled:opacity-60 inline-flex items-center gap-2">
                <Upload size={14} /> {importing ? 'Importowanie...' : 'Importuj klientów'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editingClientId ? 'Edytuj klienta' : 'Dodaj klienta'}</h2>
              <button onClick={closeModal} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Zamknij">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Agent ID</label>
                <input value={form.assignedAgentId} onChange={(e) => setForm((p) => ({ ...p, assignedAgentId: e.target.value }))} title="Agent ID" className="mt-1 w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="text-sm">Źródło</label>
                <input value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} title="Źródło" className="mt-1 w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="text-sm">Typ</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as ClientType }))} title="Typ klienta" className="mt-1 w-full px-3 py-2 border rounded-lg">
                  <option value={ClientType.BUYER}>Kupujący</option>
                  <option value={ClientType.SELLER}>Sprzedający</option>
                  <option value={ClientType.BOTH}>Obie strony</option>
                  <option value={ClientType.RENTER}>Najemca</option>
                  <option value={ClientType.LANDLORD}>Wynajmujący</option>
                </select>
              </div>
              <div>
                <label className="text-sm">Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ClientStatus }))} title="Status klienta" className="mt-1 w-full px-3 py-2 border rounded-lg">
                  <option value={ClientStatus.ACTIVE}>Aktywny</option>
                  <option value={ClientStatus.INACTIVE}>Nieaktywny</option>
                  <option value={ClientStatus.POTENTIAL}>Potencjalny</option>
                  <option value={ClientStatus.LEAD}>Lead</option>
                  <option value={ClientStatus.ARCHIVED}>Archiwalny</option>
                </select>
              </div>
              <div>
                <label className="text-sm">Liczba ofert</label>
                <input type="number" value={form.propertiesCount} onChange={(e) => setForm((p) => ({ ...p, propertiesCount: e.target.value }))} title="Liczba ofert" className="mt-1 w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>

            <div>
              <label className="text-sm">Notatki</label>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={4} title="Notatki" className="mt-1 w-full px-3 py-2 border rounded-lg" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg">Anuluj</button>
              <button onClick={() => void submitForm()} disabled={submitting} className="btn-primary px-4 py-2 rounded-md disabled:opacity-60 inline-flex items-center gap-2">
                <Copy size={14} /> {submitting ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clients
