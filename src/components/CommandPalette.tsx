import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../store/dataStore'
import type { Client } from '../types'

type PaletteItem = {
  id: string
  type: 'OFERTY' | 'KLIENCI' | 'DOKUMENTY' | 'ZADANIA' | 'AKCJE'
  title: string
  subtitle?: string
  route: string
}

type Props = {
  open: boolean
  onClose: () => void
}

const norm = (v: string) =>
  (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const scoreItem = (item: PaletteItem, query: string) => {
  const q = norm(query)
  if (!q) return 1
  const title = norm(item.title)
  const subtitle = norm(item.subtitle || '')
  const type = norm(item.type)

  let score = 0
  if (title.startsWith(q)) score += 120
  if (title.includes(q)) score += 80
  if (subtitle.includes(q)) score += 30
  if (type.includes(q)) score += 20

  const words = q.split(/\s+/).filter(Boolean)
  for (const w of words) {
    if (title.includes(w)) score += 20
    if (subtitle.includes(w)) score += 8
  }

  return score
}

const getClientDisplayName = (client: Client) => {
  const typedClient = client as Client & { fullName?: string; email?: string; phone?: string; firstName?: string; lastName?: string }
  const fullName = typedClient.fullName || `${typedClient.firstName || ''} ${typedClient.lastName || ''}`.trim()
  return {
    title: fullName || typedClient.email || 'Klient',
    subtitle: typedClient.email || typedClient.phone || typedClient.type || undefined,
  }
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { listings, clients, documents, tasks } = useDataStore()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  const allItems = useMemo<PaletteItem[]>(() => {
    const offerItems: PaletteItem[] = listings.slice(0, 100).map((l) => ({
      id: `listing-${l.id}`,
      type: 'OFERTY',
      title: l.listingNumber || 'Oferta',
      subtitle: l.property?.address?.city ? `${l.property.address.city} • ${Math.round(l.price || 0).toLocaleString('pl-PL')} zł` : undefined,
      route: '/nieruchomosci',
    }))

    const clientItems: PaletteItem[] = clients.slice(0, 100).map((c) => {
      const display = getClientDisplayName(c)
      return {
      id: `client-${c.id}`,
      type: 'KLIENCI',
      title: display.title,
      subtitle: display.subtitle,
      route: '/klienci',
      }
    })

    const documentItems: PaletteItem[] = documents.slice(0, 100).map((d) => ({
      id: `document-${d.id}`,
      type: 'DOKUMENTY',
      title: d.title || d.documentNumber || 'Dokument',
      subtitle: d.documentNumber || d.status,
      route: '/dokumenty',
    }))

    const taskItems: PaletteItem[] = tasks.slice(0, 100).map((t) => ({
      id: `task-${t.id}`,
      type: 'ZADANIA',
      title: t.title,
      subtitle: t.priority,
      route: '/zadania',
    }))

    const actionItems: PaletteItem[] = [
      { id: 'action-dashboard', type: 'AKCJE', title: 'Przejdź do dashboardu', route: '/dashboard' },
      { id: 'action-new-client', type: 'AKCJE', title: 'Dodaj klienta', route: '/klienci' },
      { id: 'action-new-property', type: 'AKCJE', title: 'Nowa nieruchomość', route: '/nieruchomosci' },
      { id: 'action-docs', type: 'AKCJE', title: 'Generuj dokument', route: '/dokumenty' },
      { id: 'action-market', type: 'AKCJE', title: 'Monitoring rynku', route: '/market' },
    ]

    return [...offerItems, ...clientItems, ...documentItems, ...taskItems, ...actionItems]
  }, [listings, clients, documents, tasks])

  const filtered = useMemo(() => {
    const raw = query.trim()
    const actionMode = raw.startsWith('>')
    const q = actionMode ? raw.slice(1).trim() : raw

    const base = actionMode ? allItems.filter((i) => i.type === 'AKCJE') : allItems

    if (!q) return base.slice(0, 30)

    return base
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.item)
  }, [allItems, query])

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const grouped = useMemo(() => {
    const order: PaletteItem['type'][] = ['AKCJE', 'OFERTY', 'KLIENCI', 'DOKUMENTY', 'ZADANIA']
    const map = new Map<PaletteItem['type'], PaletteItem[]>()
    order.forEach((k) => map.set(k, []))
    filtered.forEach((item) => map.get(item.type)?.push(item))
    return order.map((type) => ({ type, items: map.get(type) || [] })).filter((g) => g.items.length > 0)
  }, [filtered])

  const flat = filtered

  const openItem = (item: PaletteItem | undefined) => {
    if (!item) return
    navigate(item.route)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openItem(flat[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  let runningIndex = -1

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute left-1/2 top-[12%] -translate-x-1/2 w-[94vw] max-w-2xl rounded-2xl border border-[#26324a] bg-[#0f172a] shadow-2xl overflow-hidden">
        <div className="p-3 border-b border-[#26324a]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Szukaj ofert, klientów, dokumentów..."
            className="w-full px-3 py-2 rounded-lg border border-[#2f3b57] bg-[#111a2b] text-[#e5e7eb] placeholder:text-[#8ca0bf] outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="max-h-[56vh] overflow-auto p-2">
          {grouped.length === 0 ? (
            <div className="p-6 text-sm text-[#94a3b8] text-center">Brak wyników</div>
          ) : (
            grouped.map((group) => (
              <div key={group.type} className="mb-2">
                <p className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[#7f8ea9]">{group.type}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    runningIndex += 1
                    const selected = runningIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        onClick={() => openItem(item)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selected ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-[#18233a] border border-transparent'}`}
                      >
                        <p className="text-sm text-[#e5e7eb] truncate">{item.title}</p>
                        {item.subtitle ? <p className="text-xs text-[#94a3b8] truncate">{item.subtitle}</p> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-[#26324a] text-[11px] text-[#8ca0bf] flex items-center justify-between gap-2">
          <span>↑ ↓ nawigacja • Enter otwórz • Esc zamknij • <span className="text-[#cbd5e1]">&gt;</span> tylko akcje</span>
          <span>Ctrl/Cmd + K</span>
        </div>
      </div>
    </div>
  )
}
