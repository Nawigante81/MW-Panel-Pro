import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  FileText,
  Building2,
  Calendar,
  Edit,
  Plus,
  Download,
  Save,
} from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { ClientStatus, ClientType } from '../types'
import { buildDocumentDownloadUrl } from '../utils/documentDownload'
import { apiFetch } from '../utils/apiClient'

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>()
  const {
    clients,
    listings,
    documents,
    loading,
    fetchClients,
    fetchListings,
    fetchDocuments,
    updateClient,
  } = useDataStore()

  const [isEditing, setIsEditing] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [statusDraft, setStatusDraft] = useState<ClientStatus>(ClientStatus.ACTIVE)
  const [typeDraft, setTypeDraft] = useState<ClientType>(ClientType.BUYER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiRunId, setAiRunId] = useState('')
  const [aiInsight, setAiInsight] = useState<any | null>(null)

  useEffect(() => {
    void Promise.all([fetchClients(), fetchListings(), fetchDocuments()])
  }, [fetchClients, fetchListings, fetchDocuments])

  const client = useMemo(() => clients.find((c) => c.id === id), [clients, id])

  useEffect(() => {
    if (!client) return
    setNotesDraft(client.notes || '')
    setStatusDraft(client.status)
    setTypeDraft(client.type)
  }, [client])

  useEffect(() => {
    const loadInsight = async () => {
      if (!client) return
      try {
        const result = await apiFetch<any>(`/ai/insights?agencyId=${encodeURIComponent(client.agencyId)}&entityType=client&entityId=${encodeURIComponent(client.id)}`)
        setAiInsight(result)
      } catch {
        setAiInsight(null)
      }
    }
    void loadInsight()
  }, [client])

  const clientListings = useMemo(() => listings.filter((l) => l.clientId === id), [listings, id])
  const clientDocuments = useMemo(() => documents.filter((d) => d.clientId === id), [documents, id])

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      potential: 'bg-yellow-100 text-yellow-800',
      lead: 'bg-blue-100 text-blue-800',
      archived: 'bg-slate-100 text-slate-800',
      signed: 'bg-green-100 text-green-800',
      sent: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      reserved: 'bg-yellow-100 text-yellow-800',
      sold: 'bg-gray-100 text-gray-800',
      draft: 'bg-yellow-100 text-yellow-800',
    }

    const labels: Record<string, string> = {
      active: 'Aktywny',
      inactive: 'Nieaktywny',
      potential: 'Potencjalny',
      lead: 'Lead',
      archived: 'Archiwalny',
      signed: 'Podpisany',
      sent: 'Wysłany',
      completed: 'Zakończony',
      reserved: 'Zarezerwowana',
      sold: 'Sprzedana',
      draft: 'Szkic',
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const saveClient = async () => {
    if (!client) return
    try {
      setSaving(true)
      setError('')
      await updateClient(client.id, {
        notes: notesDraft,
        status: statusDraft,
        type: typeDraft,
      })
      setIsEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać klienta')
    } finally {
      setSaving(false)
    }
  }

  const refreshAiSummary = async () => {
    if (!client) return
    try {
      setAiLoading(true)
      setAiError('')
      const response = await apiFetch<any>('/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'client', entityId: client.id, promptVersion: 'summary_v1' }),
      })
      setAiInsight(response.insight)
      setAiRunId(response.run?.id || '')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Nie udało się wygenerować podsumowania AI')
    } finally {
      setAiLoading(false)
    }
  }

  const sendAiFeedback = async (feedbackType: 'useful' | 'not_useful') => {
    if (!aiRunId) return
    try {
      await apiFetch('/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiRunId, feedbackType }),
      })
    } catch {
      // ignore feedback errors in UI
    }
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Link to="/klienci" className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} /> Powrót do listy
        </Link>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold">Nie znaleziono klienta</h2>
          <p className="text-gray-600">{loading ? 'Ładowanie...' : 'Klient nie istnieje albo został usunięty.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/klienci" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Klient #{client.id.slice(0, 8)}</h1>
          <p className="text-gray-600">Szczegóły klienta</p>
        </div>
        <div className="ml-auto flex gap-2">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-100">
              <Edit size={18} /> Edytuj
            </button>
          ) : (
            <button onClick={() => void saveClient()} disabled={saving} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-60">
              <Save size={18} /> {saving ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText size={20} /> Dane klienta
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">K</div>
                <div>
                  <p className="font-medium">Klient #{client.id.slice(0, 8)}</p>
                  <p className="text-sm text-gray-500">ID: {client.id}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <Mail className="text-gray-400" size={18} />
                  <span>Brak e-mail (profil klienta nieuzupełniony)</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <Phone className="text-gray-400" size={18} />
                  <span>Brak telefonu</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700">
                  <MapPin className="text-gray-400 mt-0.5" size={18} />
                  <span>Brak adresu</span>
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Status</span>
                  {isEditing ? (
                    <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as ClientStatus)} title="Status klienta" className="px-2 py-1 border rounded text-sm">
                      <option value={ClientStatus.ACTIVE}>Aktywny</option>
                      <option value={ClientStatus.INACTIVE}>Nieaktywny</option>
                      <option value={ClientStatus.POTENTIAL}>Potencjalny</option>
                      <option value={ClientStatus.LEAD}>Lead</option>
                      <option value={ClientStatus.ARCHIVED}>Archiwalny</option>
                    </select>
                  ) : getStatusBadge(client.status)}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Typ klienta</span>
                  {isEditing ? (
                    <select value={typeDraft} onChange={(e) => setTypeDraft(e.target.value as ClientType)} title="Typ klienta" className="px-2 py-1 border rounded text-sm">
                      <option value={ClientType.BUYER}>Kupujący</option>
                      <option value={ClientType.SELLER}>Sprzedający</option>
                      <option value={ClientType.BOTH}>Obie strony</option>
                      <option value={ClientType.RENTER}>Najemca</option>
                      <option value={ClientType.LANDLORD}>Wynajmujący</option>
                    </select>
                  ) : (
                    <span className="text-sm font-medium">{client.type}</span>
                  )}
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Data rejestracji</span>
                  <span className="text-sm">{new Date(client.createdAt).toLocaleDateString('pl-PL')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4">Notatki</h2>
            {isEditing ? (
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={6} title="Notatki" className="w-full px-3 py-2 border rounded-lg" />
            ) : (
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{client.notes || 'Brak notatek'}</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">AI Insight</h2>
              <button onClick={() => void refreshAiSummary()} disabled={aiLoading} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 disabled:opacity-60">
                {aiLoading ? 'Generowanie...' : 'Odśwież'}
              </button>
            </div>
            {aiError && <p className="text-sm text-red-600">{aiError}</p>}
            {aiInsight ? (
              <>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiInsight.summary || 'Brak podsumowania.'}</p>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Kluczowe punkty</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {(aiInsight.keyPoints || []).slice(0, 5).map((p: string, idx: number) => <li key={idx}>{p}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Otwarte kwestie</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {(aiInsight.openIssues || []).slice(0, 5).map((p: string, idx: number) => <li key={idx}>{p}</li>)}
                  </ul>
                </div>
                {aiRunId && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => void sendAiFeedback('useful')} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">👍 Trafne</button>
                    <button onClick={() => void sendAiFeedback('not_useful')} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">👎 Nietrafne</button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Brak wygenerowanego insightu.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-3 rounded-lg">
                  <Building2 className="text-green-600" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{clientListings.length}</p>
                  <p className="text-sm text-gray-500">Powiązane oferty</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <FileText className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{clientDocuments.length}</p>
                  <p className="text-sm text-gray-500">Wygenerowane dokumenty</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Powiązane oferty</h2>
              <Link to="/nieruchomosci" className="text-sm text-blue-600 hover:underline">Zobacz wszystkie</Link>
            </div>
            <div className="divide-y">
              {clientListings.length === 0 && (
                <div className="p-4 text-sm text-gray-500">Brak powiązanych ofert.</div>
              )}
              {clientListings.map((listing) => (
                <Link key={listing.id} to={`/nieruchomosci/${listing.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-800">{listing.listingNumber}</p>
                      <p className="text-sm text-gray-500">{listing.property?.address?.city || '-'}, {listing.property?.address?.street || '-'}</p>
                    </div>
                    {getStatusBadge(listing.status)}
                  </div>
                  <p className="font-bold text-blue-600">{formatPrice(listing.price)}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Dokumenty klienta</h2>
              <Link to={`/generator?template=UP&clientId=${client.id}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Plus size={16} /> Nowy dokument
              </Link>
            </div>
            <div className="divide-y">
              {clientDocuments.length === 0 && (
                <div className="p-4 text-sm text-gray-500">Brak dokumentów dla klienta.</div>
              )}
              {clientDocuments.map((doc) => (
                <div key={doc.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-800">{doc.title}</p>
                      <p className="text-sm text-gray-500 font-mono">{doc.documentNumber}</p>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar size={14} />
                      {new Date(doc.createdAt).toLocaleDateString('pl-PL')}
                    </div>
                    <button
                      onClick={() => {
                        window.open(buildDocumentDownloadUrl(doc.id), '_blank', 'noopener,noreferrer')
                      }}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      <Download size={14} /> Pobierz PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClientDetail
