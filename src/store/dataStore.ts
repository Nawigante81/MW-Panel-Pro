import { create } from 'zustand'
import { 
  Client, Property, Listing, Agent, Lead, 
  Task, Meeting, Document, Activity, Notification,
  DocumentVersionEntry,
  PortalIntegration, ImportJob, PublicationJob,
  ClientStatus, ListingStatus, TaskStatus, TaskPriority
} from '../types'
import { useAuthStore } from './authStore'
import { apiFetch } from '../utils/apiClient'

interface DataState {
  // Data
  clients: Client[]
  properties: Property[]
  listings: Listing[]
  agents: Agent[]
  leads: Lead[]
  tasks: Task[]
  meetings: Meeting[]
  documents: Document[]
  documentVersionHistory: Record<string, DocumentVersionEntry[]>
  activities: Activity[]
  notifications: Notification[]
  portalIntegrations: PortalIntegration[]
  importJobs: ImportJob[]
  publicationJobs: PublicationJob[]

  // Loading states
  loading: boolean
  error: string | null

  // Actions - Clients
  fetchClients: () => Promise<void>
  addClient: (client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Client>
  updateClient: (id: string, data: Partial<Client>) => Promise<Client>
  deleteClient: (id: string) => Promise<void>

  // Actions - Properties & Listings
  fetchAgents: () => Promise<void>
  fetchProperties: () => Promise<void>
  fetchListings: () => Promise<void>
  addProperty: (property: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Property>
  addListing: (listing: Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Listing>
  updateListing: (id: string, data: Partial<Listing>) => Promise<Listing>
  deleteListing: (id: string) => Promise<void>

  // Actions - Leads
  fetchLeads: () => Promise<void>
  addLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Lead>
  updateLead: (id: string, data: Partial<Lead>) => Promise<Lead>
  deleteLead: (id: string) => Promise<void>

  // Actions - Tasks
  fetchTasks: () => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>
  completeTask: (id: string) => Promise<Task>
  deleteTask: (id: string) => Promise<void>

  // Actions - Documents
  fetchDocuments: () => Promise<void>
  addDocument: (document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Document>
  updateDocument: (id: string, data: Partial<Document>) => Promise<Document>
  createDocumentWithVersion: (payload: {
    document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>
    version: Omit<DocumentVersionEntry, 'id' | 'createdAt' | 'updatedAt' | 'documentId'>
  }) => Promise<{ document: Document; version: DocumentVersionEntry }>
  updateDocumentWithVersion: (payload: {
    documentId: string
    documentPatch: Partial<Document>
    version: Omit<DocumentVersionEntry, 'id' | 'createdAt' | 'updatedAt' | 'documentId'>
  }) => Promise<{ document: Document; version: DocumentVersionEntry }>
  saveDocumentVersion: (entry: Omit<DocumentVersionEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<DocumentVersionEntry>
  getDocumentVersions: (documentId: string) => DocumentVersionEntry[]

  // Actions - Activities
  fetchActivities: () => Promise<void>
  addActivity: (activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Activity>

  // Actions - Notifications
  fetchNotifications: () => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  unreadCount: () => number

  // Actions - Portal Integrations
  fetchPortalIntegrations: () => Promise<void>

  // Actions - Import Jobs
  fetchImportJobs: () => Promise<void>

  // Actions - Publication Jobs
  fetchPublicationJobs: () => Promise<void>

  // Helpers
  getAgencyId: () => string
}

// Helper to generate ID
const generateId = () => Math.random().toString(36).substring(2, 15)

// Helper to get current date
const now = () => new Date().toISOString()

// Mock database
const mockDB: any = {
  clients: [
    {
      id: '1',
      agencyId: 'agency-1',
      assignedAgentId: '1',
      type: 'buyer' as any,
      status: ClientStatus.ACTIVE,
      source: 'website',
      tags: ['główne', 'gotówka'],
      propertiesCount: 3,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      agencyId: 'agency-1',
      assignedAgentId: '2',
      type: 'seller' as any,
      status: ClientStatus.ACTIVE,
      source: 'referral',
      tags: ['ważny'],
      propertiesCount: 1,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '3',
      agencyId: 'agency-1',
      assignedAgentId: '1',
      type: 'both' as any,
      status: ClientStatus.POTENTIAL,
      source: 'phone',
      tags: ['główne'],
      propertiesCount: 0,
      createdAt: now(),
      updatedAt: now()
    }
  ],
  properties: [
    {
      id: '1',
      agencyId: 'agency-1',
      address: {
        street: 'Marszałkowska',
        buildingNumber: '10',
        apartmentNumber: '15',
        city: 'Warszawa',
        zipCode: '00-001',
        country: 'Poland'
      },
      propertyType: 'apartment' as any,
      marketType: 'secondary' as any,
      area: 55,
      rooms: 2,
      floors: { total: 5, current: 4 },
      yearBuilt: 2010,
      buildingType: 'Kamienica',
      condition: 'Do wykończenia',
      price: 650000,
      pricePerMeter: 11818,
      description: 'Przestronne 2-pokojowe mieszkanie w centrum miasta',
      features: {
        balconies: 1,
        elevator: true,
        HeatingType: 'Miejskie'
      },
      media: [
        { id: 'm1', type: 'image', url: 'https://via.placeholder.com/800x600', order: 0, isPrimary: true } as any
      ],
      coordinates: { lat: 52.2297, lng: 21.0122 },
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      agencyId: 'agency-1',
      address: {
        street: 'Długa',
        buildingNumber: '25',
        city: 'Gdańsk',
        zipCode: '80-001',
        country: 'Poland'
      },
      propertyType: 'house' as any,
      marketType: 'secondary' as any,
      area: 120,
      rooms: 4,
      floors: { total: 2, current: 0 },
      yearBuilt: 2005,
      buildingType: 'Wolnostojący',
      condition: 'Bardzo dobry',
      price: 850000,
      pricePerMeter: 7083,
      description: 'Dom w cichej okolicy z dużym ogródkiem',
      features: {
        balconies: 0,
        terraces: 1,
        garage: true,
        parkingSpaces: 2,
        basement: true,
        HeatingType: 'Gazowe'
      },
      media: [],
      createdAt: now(),
      updatedAt: now()
    }
  ],
  listings: [
    {
      id: '1',
      propertyId: '1',
      agencyId: 'agency-1',
      assignedAgentId: '1',
      listingNumber: 'MW/2025/0001',
      status: ListingStatus.ACTIVE,
      source: 'manual' as any,
      price: 650000,
      priceHistory: [{ price: 650000, currency: 'PLN', changedAt: now() }],
      publishedAt: now(),
      views: 156,
      inquiries: 12,
      publicationStatus: {},
      tags: ['główne', 'prezentacja'],
      property: undefined,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      propertyId: '2',
      agencyId: 'agency-1',
      assignedAgentId: '2',
      listingNumber: 'MW/2025/0002',
      status: ListingStatus.ACTIVE,
      source: 'manual' as any,
      price: 850000,
      priceHistory: [{ price: 850000, currency: 'PLN', changedAt: now() }],
      publishedAt: now(),
      views: 89,
      inquiries: 5,
      publicationStatus: {},
      tags: [],
      property: undefined,
      createdAt: now(),
      updatedAt: now()
    }
  ],
  agents: [
    {
      id: '1',
      userId: '1',
      agencyId: 'agency-1',
      licenseNumber: '1234/2024',
      specialization: ['Mieszkania', 'Domy'],
      status: 'active',
      stats: {
        listingsCount: 12,
        clientsCount: 24,
        documentsCount: 45,
        dealsClosed: 8
      },
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      userId: '2',
      agencyId: 'agency-1',
      licenseNumber: '5678/2024',
      specialization: ['Lokale użytkowe', 'Działki'],
      status: 'active',
      stats: {
        listingsCount: 8,
        clientsCount: 32,
        documentsCount: 67,
        dealsClosed: 15
      },
      createdAt: now(),
      updatedAt: now()
    }
  ],
  leads: [
    {
      id: '1',
      agencyId: 'agency-1',
      assignedAgentId: '1',
      status: 'new' as any,
      source: 'website' as any,
      name: 'Test Lead',
      email: 'test@email.com',
      phone: '+48 999 888 777',
      createdAt: now(),
      updatedAt: now()
    }
  ],
  tasks: [
    {
      id: '1',
      agencyId: 'agency-1',
      assignedToId: '1',
      createdBy: '1',
      title: 'Zadzwoń do klienta - umowa',
      priority: TaskPriority.HIGH,
      status: TaskStatus.TODO,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      tags: ['pilne'],
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      agencyId: 'agency-1',
      assignedToId: '1',
      createdBy: '2',
      clientId: '1',
      title: 'Prezentacja mieszkania M/15',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      dueDate: new Date(Date.now() + 172800000).toISOString(),
      tags: [],
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '3',
      agencyId: 'agency-1',
      assignedToId: '2',
      createdBy: '2',
      propertyId: '2',
      title: 'Zdjęcia do nieruchomości',
      priority: TaskPriority.LOW,
      status: TaskStatus.TODO,
      tags: [],
      createdAt: now(),
      updatedAt: now()
    }
  ],
  meetings: [],
  documents: [
    {
      id: '1',
      agencyId: 'agency-1',
      documentNumber: 'UP/2025/0001',
      type: 'brokerage_agreement' as any,
      status: 'sent' as any,
      clientId: '1',
      agentId: '1',
      title: 'Umowa pośrednictwa - Anna Nowak',
      content: '',
      sentAt: now(),
      metadata: {},
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      agencyId: 'agency-1',
      documentNumber: 'PP/2025/0002',
      type: 'presentation_protocol' as any,
      status: 'signed' as any,
      clientId: '2',
      propertyId: '1',
      agentId: '1',
      title: 'Protokół prezentacji - M10/15',
      content: '',
      sentAt: now(),
      signedAt: now(),
      metadata: {},
      createdAt: now(),
      updatedAt: now()
    }
  ],
  documentVersionHistory: {
    '1': [
      {
        id: 'dv-1',
        agencyId: 'agency-1',
        documentId: '1',
        documentNumber: 'UP/2025/0001',
        documentType: 'brokerage_agreement',
        title: 'Umowa pośrednictwa - Anna Nowak',
        version: 1,
        status: 'sent',
        hash: 'a31f5c9b',
        note: 'Wersja początkowa',
        createdAt: now(),
        updatedAt: now()
      }
    ]
  },
  activities: [
    {
      id: '1',
      agencyId: 'agency-1',
      userId: '1',
      type: 'client_created' as any,
      entityType: 'client',
      entityId: '1',
      entityName: 'Anna Nowak',
      description: 'Utworzono klienta',
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      agencyId: 'agency-1',
      userId: '1',
      type: 'listing_created' as any,
      entityType: 'listing',
      entityId: '1',
      entityName: 'MW/2025/0001',
      description: 'Utworzono ofertę',
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '3',
      agencyId: 'agency-1',
      userId: '1',
      type: 'document_signed' as any,
      entityType: 'document',
      entityId: '2',
      entityName: 'PP/2025/0002',
      description: 'Podpisano dokument',
      createdAt: now(),
      updatedAt: now()
    }
  ],
  notifications: [
    {
      id: '1',
      userId: '1',
      agencyId: 'agency-1',
      type: 'new_lead' as any,
      title: 'Nowy lead',
      message: 'Otrzymano nowe zapytanie z formularza na stronie',
      read: false,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: '2',
      userId: '1',
      agencyId: 'agency-1',
      type: 'task_due' as any,
      title: 'Termin zadania',
      message: 'Zadanie "Zadzwoń do klienta" ma termin jutro',
      read: false,
      createdAt: now(),
      updatedAt: now()
    }
  ],
  portalIntegrations: [],
  importJobs: [],
  publicationJobs: []
}

export const useDataStore = create<DataState>((set, get) => ({
  clients: [],
  properties: [],
  listings: [],
  agents: [],
  leads: [],
  tasks: [],
  meetings: [],
  documents: [],
  documentVersionHistory: {},
  activities: [],
  notifications: [],
  portalIntegrations: [],
  importJobs: [],
  publicationJobs: [],
  loading: false,
  error: null,

  getAgencyId: () => {
    const { user } = useAuthStore.getState()
    return user?.agencyId || 'agency-1'
  },

  // Clients
  fetchClients: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const clients = await apiFetch<Client[]>(`/clients?agencyId=${encodeURIComponent(agencyId)}`)
      set({ clients, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania klientów', loading: false })
    }
  },

  addClient: async (clientData) => {
    try {
      const client = await apiFetch<Client>('/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      })
      set((state) => ({ clients: [client, ...state.clients.filter((c) => c.id !== client.id)] }))
      return client
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się utworzyć klienta'))
    }
  },

  updateClient: async (id, data) => {
    try {
      const client = await apiFetch<Client>(`/clients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      set((state) => ({
        clients: state.clients.map(c => c.id === id ? client : c)
      }))
      return client
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się zaktualizować klienta'))
    }
  },

  deleteClient: async (id) => {
    try {
      await apiFetch<{ id: string; deleted: boolean }>(`/clients/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      set((state) => ({
        clients: state.clients.filter(c => c.id !== id)
      }))
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się usunąć klienta'))
    }
  },

  // Properties & Listings
  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const agents = await apiFetch<Agent[]>(`/agents?agencyId=${encodeURIComponent(agencyId)}`)
      set({ agents, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania agentów', loading: false })
    }
  },

  fetchProperties: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const properties = await apiFetch<Property[]>(`/properties?agencyId=${encodeURIComponent(agencyId)}`)
      set({ properties, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania nieruchomości', loading: false })
    }
  },

  fetchListings: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const [listingsRaw, properties] = await Promise.all([
        apiFetch<Listing[]>(`/listings?agencyId=${encodeURIComponent(agencyId)}`),
        apiFetch<Property[]>(`/properties?agencyId=${encodeURIComponent(agencyId)}`),
      ])
      const propertyById = Object.fromEntries(properties.map((p) => [p.id, p]))
      const listings = listingsRaw.map((l) => ({
        ...l,
        property: propertyById[l.propertyId],
      }))
      set({ listings, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania ofert', loading: false })
    }
  },

  addProperty: async (propertyData) => {
    try {
      const property = await apiFetch<Property>('/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyData),
      })
      set((state) => ({ properties: [property, ...state.properties.filter((p) => p.id !== property.id)] }))
      return property
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się utworzyć nieruchomości'))
    }
  },

  addListing: async (listingData) => {
    try {
      const listing = await apiFetch<Listing>('/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listingData),
      })

      set((state) => ({
        listings: [
          {
            ...listing,
            property: state.properties.find((p) => p.id === listing.propertyId),
          },
          ...state.listings.filter((l) => l.id !== listing.id),
        ],
      }))

      return listing
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się utworzyć oferty'))
    }
  },

  updateListing: async (id, data) => {
    try {
      const listing = await apiFetch<Listing>(`/listings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      set((state) => ({
        listings: state.listings.map(l => l.id === id ? {
          ...listing,
          property: state.properties.find((p) => p.id === listing.propertyId),
        } : l)
      }))
      return listing
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się zaktualizować oferty'))
    }
  },

  deleteListing: async (id) => {
    try {
      await apiFetch<{ id: string; deleted: boolean }>(`/listings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      set((state) => ({
        listings: state.listings.filter(l => l.id !== id)
      }))
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się usunąć oferty'))
    }
  },

  // Leads
  fetchLeads: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const leads = await apiFetch<Lead[]>(`/leads?agencyId=${encodeURIComponent(agencyId)}`)
      set({ leads, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania leadów', loading: false })
    }
  },

  addLead: async (leadData) => {
    try {
      const lead = await apiFetch<Lead>('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData),
      })
      set((state) => ({ leads: [lead, ...state.leads.filter((l) => l.id !== lead.id)] }))

      return lead
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się utworzyć leada'))
    }
  },

  updateLead: async (id, data) => {
    try {
      const lead = await apiFetch<Lead>(`/leads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      set((state) => ({
        leads: state.leads.map(l => l.id === id ? lead : l)
      }))
      return lead
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się zaktualizować leada'))
    }
  },

  deleteLead: async (id) => {
    try {
      await apiFetch<{ id: string; deleted: boolean }>(`/leads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      set((state) => ({
        leads: state.leads.filter((l) => l.id !== id)
      }))
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się usunąć leada'))
    }
  },

  // Tasks
  fetchTasks: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const userId = useAuthStore.getState().user?.id
      const query = userId
        ? `/tasks?agencyId=${encodeURIComponent(agencyId)}&userId=${encodeURIComponent(userId)}`
        : `/tasks?agencyId=${encodeURIComponent(agencyId)}`
      const tasks = await apiFetch<Task[]>(query)
      set({ tasks, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania zadań', loading: false })
    }
  },

  addTask: async (taskData) => {
    try {
      const task = await apiFetch<Task>('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      })
      set((state) => ({ tasks: [task, ...state.tasks.filter((t) => t.id !== task.id)] }))
      return task
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się utworzyć zadania'))
    }
  },

  updateTask: async (id, data) => {
    try {
      const task = await apiFetch<Task>(`/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? task : t)
      }))
      return task
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się zaktualizować zadania'))
    }
  },

  completeTask: async (id) => {
    try {
      const task = await apiFetch<Task>(`/tasks/${encodeURIComponent(id)}/complete`, {
        method: 'POST',
      })

      set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? task : t)
      }))

      return task
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się zakończyć zadania'))
    }
  },

  deleteTask: async (id) => {
    try {
      await apiFetch<{ id: string; deleted: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id)
      }))
    } catch (error) {
      throw (error instanceof Error ? error : new Error('Nie udało się usunąć zadania'))
    }
  },

  // Documents
  fetchDocuments: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const documents = await apiFetch<Document[]>(`/documents?agencyId=${encodeURIComponent(agencyId)}`)

      const versionEntries = await Promise.all(
        documents.map(async (doc) => {
          const versions = await apiFetch<DocumentVersionEntry[]>(`/documents/${encodeURIComponent(doc.id)}/versions`)
          return [doc.id, versions] as const
        })
      )

      set({
        documents,
        documentVersionHistory: Object.fromEntries(versionEntries),
        loading: false,
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania dokumentów', loading: false })
    }
  },

  addDocument: async (documentData) => {
    const document = await apiFetch<Document>('/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentData),
    })
    set((state) => ({ documents: [document, ...state.documents.filter((d) => d.id !== document.id)] }))
    return document
  },

  updateDocument: async (id, data) => {
    const doc = await apiFetch<Document>(`/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    set((state) => ({
      documents: state.documents.map(d => d.id === id ? doc : d)
    }))
    return doc
  },

  createDocumentWithVersion: async ({ document: documentData, version: versionData }) => {
    const result = await apiFetch<{ document: Document; version: DocumentVersionEntry }>('/documents/with-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: documentData, version: versionData }),
    })
    set((state) => ({
      documents: [result.document, ...state.documents.filter((d) => d.id !== result.document.id)],
      documentVersionHistory: {
        ...state.documentVersionHistory,
        [result.document.id]: [
          result.version,
          ...(state.documentVersionHistory[result.document.id] || []),
        ],
      },
    }))
    return result
  },

  updateDocumentWithVersion: async ({ documentId, documentPatch, version: versionData }) => {
    const result = await apiFetch<{ document: Document; version: DocumentVersionEntry }>(`/documents/${encodeURIComponent(documentId)}/with-version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentPatch, version: versionData }),
    })
    set((state) => ({
      documents: state.documents.map((d) => (d.id === documentId ? result.document : d)),
      documentVersionHistory: {
        ...state.documentVersionHistory,
        [documentId]: [result.version, ...(state.documentVersionHistory[documentId] || [])],
      },
    }))
    return result
  },

  saveDocumentVersion: async (entryData) => {
    const entry = await apiFetch<DocumentVersionEntry>(`/documents/${encodeURIComponent(entryData.documentId)}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entryData),
    })

    set((state) => ({
      documentVersionHistory: {
        ...state.documentVersionHistory,
        [entry.documentId]: [entry, ...(state.documentVersionHistory[entry.documentId] || [])]
      }
    }))

    return entry
  },

  getDocumentVersions: (documentId) => {
    return get().documentVersionHistory[documentId] || []
  },

  // Activities
  fetchActivities: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const activities = await apiFetch<Activity[]>(`/activities?agencyId=${encodeURIComponent(agencyId)}`)
      set({ activities, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania aktywności', loading: false })
    }
  },

  addActivity: async (activityData) => {
    const activity = await apiFetch<Activity>('/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activityData),
    })
    set((state) => ({ activities: [activity, ...state.activities.filter((a) => a.id !== activity.id)] }))
    return activity
  },

  // Notifications
  fetchNotifications: async () => {
    set({ loading: true, error: null })
    try {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('Brak userId')
      const notifications = await apiFetch<Notification[]>(`/notifications?userId=${encodeURIComponent(userId)}`)
      set({ notifications, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania powiadomień', loading: false })
    }
  },

  markNotificationRead: async (id) => {
    const notification = await apiFetch<Notification>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    })
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? notification : n)
    }))
  },

  markAllNotificationsRead: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    await apiFetch<{ ok: boolean }>(`/notifications/mark-all-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const nowDate = now()
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true, readAt: nowDate }))
    }))
  },

  unreadCount: () => {
    return get().notifications.filter(n => !n.read).length
  },

  // Portal Integrations
  fetchPortalIntegrations: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const integrations = await apiFetch<PortalIntegration[]>(`/portal-integrations?agencyId=${encodeURIComponent(agencyId)}`)
      set({ portalIntegrations: integrations, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania integracji', loading: false })
    }
  },

  // Import Jobs
  fetchImportJobs: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const jobs = await apiFetch<ImportJob[]>(`/import-jobs?agencyId=${encodeURIComponent(agencyId)}`)
      set({ importJobs: jobs, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Błąd ładowania zadań importu', loading: false })
    }
  },

  // Publication Jobs
  fetchPublicationJobs: async () => {
    set({ loading: true, error: null })
    try {
      const agencyId = get().getAgencyId()
      const jobs = mockDB.publicationJobs.filter(j => j.agencyId === agencyId)
      set({ publicationJobs: jobs, loading: false })
    } catch (error) {
      set({ error: 'Błąd ładowania zadań publikacji', loading: false })
    }
  }
}))