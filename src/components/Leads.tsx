import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Phone, Mail, X, Trash2, Eye } from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { LeadStatus, LeadSource } from '../types'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'

const Leads = () => {
  const { leads, fetchLeads, addLead, updateLead, deleteLead } = useDataStore()
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', notes: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  useEffect(() => {
    const filter = String(searchParams.get('filter') || '').toLowerCase()
    if (filter === 'new') {
      setFilterStatus('new')
      return
    }
    if (filter === 'follow_up') {
      setFilterStatus('follow_up')
      return
    }
    if (filter === 'overdue_follow_up') {
      setFilterStatus('overdue_follow_up')
      return
    }
    if (filter === 'today_follow_up') {
      setFilterStatus('today_follow_up')
      return
    }
    if (!filter) {
      setFilterStatus('all')
    }
  }, [searchParams])

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm)

    const followUpTs = lead.followUpDate ? new Date(lead.followUpDate).getTime() : NaN
    const now = new Date()
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(now)
    dayEnd.setHours(23, 59, 59, 999)
    const isTerminal = ['converted', 'lost', 'archived'].includes(String(lead.status || '').toLowerCase())
    const hasFollowUp = Number.isFinite(followUpTs) && !isTerminal
    const isOverdueFollowUp = hasFollowUp && followUpTs < dayStart.getTime()
    const isTodayFollowUp = hasFollowUp && followUpTs >= dayStart.getTime() && followUpTs <= dayEnd.getTime()

    const matchesStatus =
      filterStatus === 'all'
      || lead.status === filterStatus
      || (filterStatus === 'follow_up' && hasFollowUp)
      || (filterStatus === 'overdue_follow_up' && isOverdueFollowUp)
      || (filterStatus === 'today_follow_up' && isTodayFollowUp)

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-green-100 text-green-800',
      converted: 'bg-emerald-100 text-emerald-800',
      lost: 'bg-red-100 text-red-800',
      archived: 'bg-gray-100 text-gray-800'
    }
    const labels = {
      new: 'Nowy',
      contacted: 'Kontakt',
      qualified: 'Kwalifikowany',
      converted: 'Konwersja',
      lost: 'Utracony',
      archived: 'Archiwalny'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      website: 'Strona www',
      phone: 'Telefon',
      email: 'Email',
      referral: 'Polecenie',
      portal: 'Z portalu',
      social: 'Social media',
      advertising: 'Reklama',
      other: 'Inne'
    }
    return labels[source] || source
  }

  const handleAddLead = async () => {
    try {
      setError('')
      await addLead({
        agencyId: 'agency-1',
        assignedAgentId: '1',
        status: LeadStatus.NEW,
        source: LeadSource.WEBSITE,
        name: newLead.name,
        email: newLead.email || undefined,
        phone: newLead.phone || undefined,
        notes: newLead.notes
      })
      setNewLead({ name: '', email: '', phone: '', notes: '' })
      setShowModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać leada')
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć tego leada?')
    if (!confirmed) return
    try {
      setError('')
      await deleteLead(leadId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć leada')
    }
  }

  const handleStatusChange = async (leadId: string, status: LeadStatus) => {
    try {
      setError('')
      await updateLead(leadId, { status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić statusu leada')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Leady</h1>
          <p className="text-gray-600 dark:text-gray-400">Zarządzaj leadami i konwersjami</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap self-start">
          <ContextHelpButton help={getContextHelp('/leads')} />
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors self-start"
          >
            <Plus size={20} />
            Nowy lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setFilterStatus('new')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterStatus === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Nowe
          </button>
          <button
            onClick={() => setFilterStatus('today_follow_up')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterStatus === 'today_follow_up' ? 'bg-orange-600 text-white border-orange-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Follow-up na dziś
          </button>
          <button
            onClick={() => setFilterStatus('overdue_follow_up')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterStatus === 'overdue_follow_up' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Przeterminowane
          </button>
          <button
            onClick={() => setFilterStatus('follow_up')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterStatus === 'follow_up' ? 'bg-rose-600 text-white border-rose-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Wszystkie follow-up
          </button>
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterStatus === 'all' ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Wyczyść
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Szukaj leada..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            title="Filtr statusu"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <option value="all">Wszystkie statusy</option>
            <option value="new">Nowe</option>
            <option value="follow_up">Wymagają follow-up</option>
            <option value="overdue_follow_up">Follow-up przeterminowane</option>
            <option value="today_follow_up">Follow-up na dziś</option>
            <option value="contacted">Kontakt</option>
            <option value="qualified">Kwalifikowane</option>
            <option value="converted">Konwersja</option>
            <option value="lost">Utracone</option>
          </select>
        </div>
      </div>

      {/* Leads grid */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.map(lead => (
          <div key={lead.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-colors duration-200">
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold">
                {lead.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              {getStatusBadge(lead.status)}
            </div>
            
            <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{lead.name}</h3>
            
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300 mb-3">
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} />
                  <span>{lead.phone}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Status</label>
                <select
                  value={lead.status}
                  onChange={(e) => void handleStatusChange(lead.id, e.target.value as LeadStatus)}
                  title="Status"
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs"
                >
                  <option value={LeadStatus.NEW}>Nowy</option>
                  <option value={LeadStatus.CONTACTED}>Kontakt</option>
                  <option value={LeadStatus.QUALIFIED}>Kwalifikowany</option>
                  <option value={LeadStatus.CONVERTED}>Konwersja</option>
                  <option value={LeadStatus.LOST}>Utracony</option>
                  <option value={LeadStatus.ARCHIVED}>Archiwalny</option>
                </select>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Źródło: {getSourceLabel(lead.source)}</span>
                <div className="flex items-center gap-1">
                  <span>{new Date(lead.createdAt).toLocaleDateString('pl-PL')}</span>
                  <Link
                    to={`/leads/${lead.id}`}
                    className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    title="Szczegóły leada"
                  >
                    <Eye size={14} />
                  </Link>
                  <button
                    onClick={() => void handleDeleteLead(lead.id)}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                    title="Usuń leada"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredLeads.length === 0 && (
          <div className="col-span-full p-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <p>Brak leadów spełniających kryteria</p>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-6 transition-colors duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Nowy lead</h2>
              <button onClick={() => setShowModal(false)} title="Zamknij" className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200">
                <X size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Imię i nazwisko / nazwa firmy *"
                value={newLead.name}
                onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
              />
              <input
                type="email"
                placeholder="Email"
                value={newLead.email}
                onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
              />
              <input
                type="tel"
                placeholder="Telefon"
                value={newLead.phone}
                onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
              />
              <textarea
                placeholder="Notatki..."
                value={newLead.notes}
                onChange={(e) => setNewLead({...newLead, notes: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none transition-colors duration-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddLead}
                  disabled={!newLead.name.trim()}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
                >
                  Dodaj
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors duration-200"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Leads