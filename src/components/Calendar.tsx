import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns'
import { pl } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, MapPin, User, Clock } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'
import { apiFetch, apiJsonFetch } from '../utils/apiClient'

type Reservation = {
  id: string
  agencyId: string
  clientName: string
  agentName?: string
  listingId?: string
  title: string
  status: string
  location?: string
  notes?: string
  startAt: string
  endAt: string
  createdAt: string
  updatedAt: string
}

type ReservationForm = {
  id?: string
  clientName: string
  title: string
  startAt: string
  endAt: string
  location: string
  notes: string
  status: string
  agentName: string
}

const defaultForm: ReservationForm = {
  clientName: '',
  title: 'Prezentacja nieruchomości',
  startAt: '',
  endAt: '',
  location: '',
  notes: '',
  status: 'scheduled',
  agentName: '',
}

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<ReservationForm>(defaultForm)

  const agencyId = useAuthStore((state) => state.agency?.id || 'agency-1')

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  const calendarStart = useMemo(() => {
    const value = new Date(monthStart)
    value.setDate(value.getDate() - value.getDay())
    return value
  }, [monthStart])

  const calendarEnd = useMemo(() => {
    const value = new Date(monthEnd)
    value.setDate(value.getDate() + (6 - value.getDay()))
    return value
  }, [monthEnd])

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const weekDays = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob']

  const loadReservations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const from = calendarStart.toISOString()
      const to = new Date(calendarEnd.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      const data = await apiFetch<Reservation[]>(`/reservations?agencyId=${encodeURIComponent(agencyId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      setReservations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać rezerwacji')
    } finally {
      setLoading(false)
    }
  }, [agencyId, calendarEnd, calendarStart])

  useEffect(() => {
    void loadReservations()
  }, [loadReservations])

  const getEventsForDay = useCallback(
    (date: Date) => reservations.filter((reservation) => isSameDay(new Date(reservation.startAt), date)),
    [reservations]
  )

  const reservationsForSelectedDay = useMemo(() => {
    if (!selectedDate) return []
    return getEventsForDay(selectedDate)
  }, [getEventsForDay, selectedDate])

  const openCreateModal = () => {
    const start = selectedDate ? new Date(selectedDate) : new Date()
    start.setHours(10, 0, 0, 0)
    const end = new Date(start)
    end.setHours(start.getHours() + 1)
    setEditingReservation(null)
    setForm({
      ...defaultForm,
      startAt: start.toISOString().slice(0, 16),
      endAt: end.toISOString().slice(0, 16),
      agentName: useAuthStore.getState().profile ? `${useAuthStore.getState().profile?.firstName} ${useAuthStore.getState().profile?.lastName}` : '',
    })
    setError('')
    setShowModal(true)
  }

  const openEditModal = (reservation: Reservation) => {
    setEditingReservation(reservation)
    setForm({
      id: reservation.id,
      clientName: reservation.clientName,
      title: reservation.title,
      startAt: reservation.startAt.slice(0, 16),
      endAt: reservation.endAt.slice(0, 16),
      location: reservation.location || '',
      notes: reservation.notes || '',
      status: reservation.status,
      agentName: reservation.agentName || '',
    })
    setError('')
    setShowModal(true)
  }

  const saveReservation = async () => {
    if (!form.clientName.trim() || !form.title.trim() || !form.startAt || !form.endAt) {
      setError('Uzupełnij wymagane pola')
      return
    }

    const body = {
      agencyId,
      clientName: form.clientName.trim(),
      title: form.title.trim(),
      status: form.status,
      agentName: form.agentName.trim() || undefined,
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
    }

    try {
      if (editingReservation) {
        await apiJsonFetch<Reservation>(`/reservations/${encodeURIComponent(editingReservation.id)}`, { method: 'PATCH' }, body)
      } else {
        await apiJsonFetch<Reservation>('/reservations', { method: 'POST' }, body)
      }
      setShowModal(false)
      setEditingReservation(null)
      setForm(defaultForm)
      await loadReservations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać rezerwacji')
    }
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 bg-[#0f172a] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-[#f1f5f9]">Kalendarz</h1>
              <div className="hidden sm:flex items-center gap-2 text-[#9fb0c5]">
                <CalendarIcon className="h-5 w-5" />
                <span>{format(currentDate, 'MMMM yyyy', { locale: pl })}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <ContextHelpButton help={getContextHelp('/kalendarz')} />
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-[#16243d] text-[#9fb0c5]" title="Poprzedni miesiąc">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-[#16243d] text-[#9fb0c5]">
                Dzisiaj
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-[#16243d] text-[#9fb0c5]" title="Następny miesiąc">
                <ChevronRight className="h-5 w-5" />
              </button>

              <button onClick={openCreateModal} className="ml-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                <Plus className="h-5 w-5" />
                <span className="hidden sm:inline">Nowa rezerwacja</span>
              </button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="bg-[#0f172a] rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#2b3a57]">
            {weekDays.map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-[#9fb0c5] border-r border-[#2b3a57] last:border-r-0 bg-gray-50 dark:bg-gray-900">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const dayEvents = getEventsForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isSelected = selectedDate && isSameDay(day, selectedDate)

              return (
                <div key={index} onClick={() => setSelectedDate(day)} className={`min-h-[120px] p-2 border-b border-r border-[#2b3a57] cursor-pointer ${!isCurrentMonth ? 'bg-gray-50 dark:bg-gray-900 opacity-50' : 'hover:bg-[#111a2b]/50'} ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <div className={`${isToday(day) ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : ''} text-sm font-medium mb-1 ${!isCurrentMonth ? 'text-[#4a5f7a] dark:text-gray-600' : 'text-[#f1f5f9]'}`}>
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => (
                      <div key={event.id} className="text-xs p-1.5 rounded bg-[#16243d] hover:opacity-80 cursor-pointer" onClick={(e) => { e.stopPropagation(); openEditModal(event) }}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="truncate font-medium text-[#f1f5f9]">{event.title}</span>
                        </div>
                        <div className="text-xs text-[#9fb0c5] ml-3">
                          {format(new Date(event.startAt), 'HH:mm')}
                        </div>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <div className="text-xs text-[#9fb0c5] ml-1">+{dayEvents.length - 3} więcej</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="mt-6 bg-[#0f172a] rounded-lg p-4">
            <h3 className="text-lg font-semibold text-[#f1f5f9] mb-4">{format(selectedDate, 'd MMMM yyyy', { locale: pl })}</h3>
            {loading ? <p className="text-[#9fb0c5]">Ładowanie...</p> : null}
            <div className="space-y-3">
              {reservationsForSelectedDay.map(event => (
                <div key={event.id} className="p-4 rounded-lg border border-[#2b3a57] hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEditModal(event)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <h4 className="font-medium text-[#f1f5f9]">{event.title}</h4>
                    </div>
                    <span className="text-xs text-[#9fb0c5] capitalize">{event.status}</span>
                  </div>

                  <p className="text-sm text-[#9fb0c5] mb-2">{event.clientName}</p>

                  <div className="flex items-center gap-4 text-sm text-[#9fb0c5]">
                    <div className="flex items-center gap-1"><Clock className="h-4 w-4" /><span>{format(new Date(event.startAt), 'HH:mm')} - {format(new Date(event.endAt), 'HH:mm')}</span></div>
                    {event.location ? <div className="flex items-center gap-1"><MapPin className="h-4 w-4" /><span>{event.location}</span></div> : null}
                    {event.agentName ? <div className="flex items-center gap-1"><User className="h-4 w-4" /><span>{event.agentName}</span></div> : null}
                  </div>
                </div>
              ))}

              {reservationsForSelectedDay.length === 0 && <p className="text-[#9fb0c5]">Brak rezerwacji w tym dniu</p>}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] rounded-lg shadow-xl shadow-black/60 w-full max-w-md">
            <div className="p-6 border-b border-[#2b3a57]">
              <h2 className="text-xl font-semibold text-[#f1f5f9]">{editingReservation ? 'Edytuj rezerwację' : 'Nowa rezerwacja'}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Klient</label>
                <input value={form.clientName} onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))} type="text" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" placeholder="Imię i nazwisko" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Tytuł</label>
                <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} type="text" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" placeholder="Tytuł" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Agent</label>
                <input value={form.agentName} onChange={(e) => setForm((prev) => ({ ...prev, agentName: e.target.value }))} type="text" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" placeholder="Agent prowadzący" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Start</label>
                  <input value={form.startAt} onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))} type="datetime-local" title="Data i godzina rozpoczęcia" placeholder="Start" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Koniec</label>
                  <input value={form.endAt} onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))} type="datetime-local" title="Data i godzina zakończenia" placeholder="Koniec" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} title="Status rezerwacji" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]">
                  <option value="scheduled">Zaplanowana</option>
                  <option value="confirmed">Potwierdzona</option>
                  <option value="completed">Zakończona</option>
                  <option value="cancelled">Anulowana</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Lokalizacja</label>
                <input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} type="text" className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" placeholder="Adres" />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f1f5f9] mb-1">Opis</label>
                <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full px-4 py-2 rounded-lg border border-[#2b3a57] bg-[#0c1524] text-[#f1f5f9]" placeholder="Notatki" />
              </div>

              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            </div>

            <div className="p-6 border-t border-[#2b3a57] flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#2b3a57] text-[#f1f5f9] hover:bg-[#111a2b]">Anuluj</button>
              <button onClick={() => void saveReservation()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Zapisz</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calendar

