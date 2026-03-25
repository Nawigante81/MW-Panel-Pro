import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, Save } from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { LeadStatus, LeadSource } from '../types'

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const { leads, fetchLeads, updateLead, loading } = useDataStore()
  const [status, setStatus] = useState<LeadStatus>(LeadStatus.NEW)
  const [source, setSource] = useState<LeadSource>(LeadSource.WEBSITE)
  const [notes, setNotes] = useState('')
  const [propertyInterest, setPropertyInterest] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    void fetchLeads()
  }, [fetchLeads])

  const lead = useMemo(() => leads.find((l) => l.id === id), [leads, id])

  useEffect(() => {
    if (!lead) return
    setStatus(lead.status)
    setSource(lead.source)
    setNotes(lead.notes || '')
    setPropertyInterest(lead.propertyInterest || '')
    setFollowUpDate(lead.followUpDate ? lead.followUpDate.slice(0, 10) : '')
  }, [lead])

  const save = async () => {
    if (!lead) return
    try {
      setSaving(true)
      setError('')
      setInfo('')
      await updateLead(lead.id, {
        status,
        source,
        notes,
        propertyInterest: propertyInterest || undefined,
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      })
      setInfo('Zapisano zmiany leada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian')
    } finally {
      setSaving(false)
    }
  }

  if (!lead) {
    return (
      <div className="space-y-4">
        <Link to="/leads" className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50">
          <ArrowLeft size={16} /> Wróć do listy leadów
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold">Nie znaleziono leada</h2>
          <p className="text-sm text-gray-600">{loading ? 'Ładowanie...' : 'Lead nie istnieje lub został usunięty.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/leads" className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{lead.name}</h1>
            <p className="text-gray-500 dark:text-gray-400">Szczegóły leada</p>
          </div>
        </div>
        <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60">
          <Save size={16} /> {saving ? 'Zapisywanie...' : 'Zapisz'}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {info && <div className="text-sm text-emerald-600">{info}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold">Kontakt</h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Mail size={14} /> {lead.email || 'Brak e-mail'}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Phone size={14} /> {lead.phone || 'Brak telefonu'}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold">Status i źródło</h2>
          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} title="Status" className="mt-1 w-full px-3 py-2 border rounded-lg">
              <option value={LeadStatus.NEW}>Nowy</option>
              <option value={LeadStatus.CONTACTED}>Kontakt</option>
              <option value={LeadStatus.QUALIFIED}>Kwalifikowany</option>
              <option value={LeadStatus.CONVERTED}>Konwersja</option>
              <option value={LeadStatus.LOST}>Utracony</option>
              <option value={LeadStatus.ARCHIVED}>Archiwalny</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Źródło</label>
            <select value={source} onChange={(e) => setSource(e.target.value as LeadSource)} title="Źródło" className="mt-1 w-full px-3 py-2 border rounded-lg">
              <option value={LeadSource.WEBSITE}>Strona www</option>
              <option value={LeadSource.PHONE}>Telefon</option>
              <option value={LeadSource.EMAIL}>Email</option>
              <option value={LeadSource.REFERRAL}>Polecenie</option>
              <option value={LeadSource.PORTAL}>Portal</option>
              <option value={LeadSource.SOCIAL}>Social media</option>
              <option value={LeadSource.ADVERTISING}>Reklama</option>
              <option value={LeadSource.OTHER}>Inne</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="font-semibold">Dodatkowe informacje</h2>
        <div>
          <label className="text-sm text-gray-600">Zainteresowanie nieruchomością</label>
          <input value={propertyInterest} onChange={(e) => setPropertyInterest(e.target.value)} title="Zainteresowanie nieruchomością" className="mt-1 w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label className="text-sm text-gray-600">Follow-up</label>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} title="Follow-up" className="mt-1 w-full px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label className="text-sm text-gray-600">Notatki</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} title="Notatki" className="mt-1 w-full px-3 py-2 border rounded-lg" />
        </div>
      </div>
    </div>
  )
}
