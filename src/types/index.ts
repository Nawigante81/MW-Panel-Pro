// ========== CORE TYPES ==========

export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

// ========== USER & AUTH ==========

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  AGENT = 'agent',
  USER = 'user'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

export interface User extends BaseEntity {
  email: string
  passwordHash?: string
  role: UserRole
  status: UserStatus
  agencyId: string
  profileId?: string
  lastLoginAt?: string
}

export interface Profile extends BaseEntity {
  userId: string
  firstName: string
  lastName: string
  phone?: string
  avatar?: string
  cover?: string
  address?: string
  city?: string
  zipCode?: string
  country?: string
}

// ========== AGENCY ==========

export interface Agency extends BaseEntity {
  id: string
  name: string
  nip: string
  regon?: string
  address: string
  city: string
  zipCode: string
  phone: string
  email: string
  website?: string
  logo?: string
  licenseNumber?: string
  settings: AgencySettings
}

export interface AgencySettings {
  defaultDocumentTemplate?: string
  documentNumberPrefix?: boolean
  autoPublishListings?: boolean
  notificationEmail?: string
  primaryColor?: string
}

// ========== AGENT ==========

export interface Agent extends BaseEntity {
  userId: string
  agencyId: string
  licenseNumber?: string
  specialization: string[]
  commissionRate?: number
  targetProperties?: number
  targetClients?: number
  status: 'active' | 'inactive' | 'on_leave'
  stats: AgentStats
}

export interface AgentStats {
  listingsCount: number
  clientsCount: number
  documentsCount: number
  dealsClosed: number
  revenue?: number
}

// ========== CLIENT ==========

export enum ClientType {
  BUYER = 'buyer',
  SELLER = 'seller',
  BOTH = 'both',
  RENTER = 'renter',
  LANDLORD = 'landlord'
}

export enum ClientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  POTENTIAL = 'potential',
  LEAD = 'lead',
  ARCHIVED = 'archived'
}

export interface Client extends BaseEntity {
  agencyId: string
  assignedAgentId?: string
  profileId?: string
  type: ClientType
  status: ClientStatus
  source?: string
  notes?: string
  preferences?: ClientPreferences
  tags: string[]
  propertiesCount: number
}

export interface ClientPreferences {
  propertyTypes?: PropertyType[]
  locations?: string[]
  priceMin?: number
  priceMax?: number
  areaMin?: number
  areaMax?: number
  roomsMin?: number
  roomsMax?: number
  requirements?: string
}

// ========== LEAD ==========

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost',
  ARCHIVED = 'archived'
}

export enum LeadSource {
  WEBSITE = 'website',
  PHONE = 'phone',
  EMAIL = 'email',
  REFERRAL = 'referral',
  PORTAL = 'portal',
  SOCIAL = 'social',
  ADVERTISING = 'advertising',
  OTHER = 'other'
}

export interface Lead extends BaseEntity {
  agencyId: string
  assignedAgentId?: string
  clientId?: string
  status: LeadStatus
  source: LeadSource
  name: string
  email?: string
  phone?: string
  propertyInterest?: string
  budgetMin?: number
  budgetMax?: number
  notes?: string
  followUpDate?: string
  convertedAt?: string
}

// ========== PROPERTY & LISTING ==========

export enum PropertyType {
  APARTMENT = 'apartment',
  HOUSE = 'house',
  TERRACE = 'terrace',
  SEMI_DETACHED = 'semi_detached',
  DETACHED = 'detached',
  PLOT = 'plot',
  COMMERCIAL = 'commercial',
  OFFICE = 'office',
  GARAGE = 'garage',
  PARKING = 'parking',
  WAREHOUSE = 'warehouse'
}

export enum MarketType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary'
}

export enum ListingStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  RESERVED = 'reserved',
  SOLD = 'sold',
  RENTED = 'rented',
  WITHDRAWN = 'withdrawn',
  ARCHIVED = 'archived'
}

// Canonical backend enum for offer/listing lifecycle.
export enum OfferStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SOLD = 'sold',
  EXPIRED = 'expired'
}

export enum ListingSource {
  MANUAL = 'manual',
  OTODOM = 'otodom',
  OLX = 'olx',
  GRATKA = 'gratka',
  MORBIER = 'morbiertype',
  DOMIPORTA = 'domiporta',
  OTHER = 'other'
}

export interface Property extends BaseEntity {
  agencyId: string
  address: PropertyAddress
  propertyType: PropertyType
  marketType: MarketType
  area: number
  plotArea?: number
  rooms?: number
  floors?: {
    total?: number
    current?: number
  }
  yearBuilt?: number
  buildingType?: string
  condition?: string
  price: number
  pricePerMeter?: number
  ownershipStatus?: string
  description?: string
  features?: PropertyFeatures
  media: PropertyMedia[]
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface PropertyAddress {
  street: string
  buildingNumber?: string
  apartmentNumber?: string
  city: string
  zipCode: string
  district?: string
  voivodeship?: string
  country: string
}

export interface PropertyFeatures {
  balconies?: number
  terraces?: number
  garage?: boolean
  parkingSpaces?: number
  basement?: boolean
  attic?: boolean
  elevator?: boolean
  HeatingType?: string
  windowsType?: string
  finishCondition?: string
  kitchenType?: string
}

export interface PropertyMedia {
  id: string
  type: 'image' | 'video' | 'floor_plan' | 'panorama'
  url: string
  thumbnail?: string
  title?: string
  order: number
  isPrimary?: boolean
}

export interface Listing extends BaseEntity {
  propertyId: string
  agencyId: string
  assignedAgentId?: string
  clientId?: string
  listingNumber: string
  status: ListingStatus
  source: ListingSource
  sourceUrl?: string
  price: number
  priceOriginal?: number
  priceHistory: PriceHistory[]
  publishedAt?: string
  reservedAt?: string
  soldAt?: string
  views: number
  inquiries: number
  publicationStatus: PublicationPortalStatus
  notes?: string
  tags: string[]
  property?: Property
}

export interface PriceHistory {
  price: number
  currency: string
  changedAt: string
  reason?: string
}

export interface PublicationPortalStatus {
  otodom?: { status: string; publishedAt?: string; listingId?: string }
  olx?: { status: string; publishedAt?: string; listingId?: string }
  gratka?: { status: string; publishedAt?: string; listingId?: string }
}

// ========== DOCUMENTS ==========

export enum DocumentType {
  BROKERAGE_AGREEMENT = 'brokerage_agreement',
  PRESENTATION_PROTOCOL = 'presentation_protocol',
  PROPERTY_CARD = 'property_card',
  RESERVATION_CONFIRMATION = 'reservation_confirmation',
  SEARCH_ORDER = 'search_order',
  OTHER = 'other'
}

export enum DocumentStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  SIGNED = 'signed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled'
}

export interface Document extends BaseEntity {
  agencyId: string
  documentNumber: string
  type: DocumentType
  documentType?: string
  templateKey?: string
  templateVersion?: number
  category?: string
  outputFormat?: string
  rendererKey?: string
  status: DocumentStatus
  clientId?: string
  propertyId?: string
  transactionId?: string
  createdBy?: string
  agentId?: string
  title: string
  content: string
  pdfUrl?: string
  fileUrl?: string
  storageKey?: string
  sentAt?: string
  signedAt?: string
  metadata: Record<string, any>
  generatedPayloadSnapshot?: Record<string, any>
}

export interface DocumentVersionEntry extends BaseEntity {
  agencyId: string
  documentId: string
  documentNumber: string
  documentType: string
  title: string
  version: number
  status: DocumentStatus
  hash: string
  note?: string
}

// ========== TASKS ==========

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface Task extends BaseEntity {
  agencyId: string
  assignedToId: string
  createdBy: string
  clientId?: string
  propertyId?: string
  listingId?: string
  title: string
  description?: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  completedAt?: string
  tags: string[]
}

// ========== ACTIVITIES ==========

export enum ActivityType {
  CLIENT_CREATED = 'client_created',
  CLIENT_UPDATED = 'client_updated',
  PROPERTY_CREATED = 'property_created',
  PROPERTY_UPDATED = 'property_updated',
  LISTING_CREATED = 'listing_created',
  LISTING_UPDATED = 'listing_updated',
  DOCUMENT_CREATED = 'document_created',
  DOCUMENT_SIGNED = 'document_signed',
  TASK_COMPLETED = 'task_completed',
  LEAD_CREATED = 'lead_created',
  LEAD_CONVERTED = 'lead_converted',
  MEETING_SCHEDULED = 'meeting_scheduled',
  MEETING_COMPLETED = 'meeting_completed',
  PRESENTATION_COMPLETED = 'presentation_completed',
  VIEWING_SCHEDULED = 'viewing_scheduled',
  VIEWING_COMPLETED = 'viewing_completed',
  OFFER_MADE = 'offer_made',
  OFFER_ACCEPTED = 'offer_accepted',
  DEAL_CLOSED = 'deal_closed'
}

export interface Activity extends BaseEntity {
  agencyId: string
  userId: string
  type: ActivityType
  entityType: 'client' | 'property' | 'listing' | 'document' | 'lead' | 'task'
  entityId: string
  entityName: string
  description: string
  metadata?: Record<string, any>
}

// ========== MEETINGS ==========

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show'
}

export interface Meeting extends BaseEntity {
  agencyId: string
  clientId: string
  agentId: string
  propertyId?: string
  title: string
  description?: string
  status: MeetingStatus
  startAt: string
  endAt: string
  location?: string
  notes?: string
  attendees: string[]
}

// ========== NOTIFICATIONS ==========

export enum NotificationType {
  TASK_DUE = 'task_due',
  TASK_OVERDUE = 'task_overdue',
  MEETING_REMINDER = 'meeting_reminder',
  NEW_LEAD = 'new_lead',
  LEAD_REASSIGNMENT = 'lead_reassignment',
  LISTING_VIEWED = 'listing_viewed',
  LISTING_INQUIRY = 'listing_inquiry',
  DOCUMENT_SIGNED = 'document_signed',
  PUBLICATION_ERROR = 'publication_error',
  SYSTEM = 'system'
}

export interface Notification extends BaseEntity {
  userId: string
  agencyId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  readAt?: string
  actionUrl?: string
  metadata?: Record<string, any>
}

// ========== MARKET MONITORING & INTEGRATIONS ==========

export enum PortalType {
  OTODOM = 'otodom',
  OLX = 'olx',
  GRATKA = 'gratka',
  DOMIPORTA = 'domiporta',
  MORBIER = 'morbiertype'
}

export enum ImportStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PortalIntegration extends BaseEntity {
  agencyId: string
  portal: PortalType
  isActive: boolean
  credentials: {
    username?: string
    apiKey?: string
    accessToken?: string
    refreshToken?: string
  }
  settings: {
    autoImport?: boolean
    importInterval?: number
    autoPublish?: boolean
  }
  lastImportAt?: string
  lastImportStatus?: ImportStatus
}

export interface ImportJob extends BaseEntity {
  agencyId: string
  portal: PortalType
  status: ImportStatus
  startedAt?: string
  completedAt?: string
  listingsImported: number
  newListings: number
  priceChanges: number
  errors: number
  errorMessage?: string
}

// ========== PUBLICATION ==========

export enum PublicationStatusType {
  PENDING = 'pending',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  RETRYING = 'retrying',
  REMOVED = 'removed'
}

export interface PublicationJob extends BaseEntity {
  agencyId: string
  listingId: string
  portal: PortalType
  status: PublicationStatusType
  attempt: number
  maxAttempts: number
  nextAttemptAt?: string
  publishedAt?: string
  portalListingId?: string
  portalUrl?: string
  response?: {
    statusCode?: number
    message?: string
    data?: any
  }
  error?: {
    code: string
    message: string
    details?: any
  }
}

// ========== ADMIN & AUDIT ==========

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  ROLE_CHANGED = 'role_changed',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  SETTINGS_CHANGED = 'settings_changed',
  INTEGRATION_CONFIGURED = 'integration_configured',
  DATA_EXPORTED = 'data_exported',
  DATA_IMPORTED = 'data_imported'
}

export interface AuditLog extends BaseEntity {
  agencyId: string
  userId: string
  action: AuditAction
  entityType?: string
  entityId?: string
  entityName?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export interface SystemSettings {
  agencyId: string
  key: string
  value: any
  description?: string
  updatedAt: string
}

// ========== NOTES ==========

export interface Note extends BaseEntity {
  agencyId: string
  userId: string
  clientId?: string
  propertyId?: string
  listingId?: string
  leadId?: string
  content: string
  isPrivate: boolean
}
// ========== EXTERNAL LISTINGS / IMPORTER ==========

export interface ExternalSource {
  id: string
  name: string
  code: string
  baseUrl: string
  isActive: boolean
  config?: Record<string, unknown>
  lastSyncAt?: string | null
  lastStatus?: string | null
  lastError?: string | null
  health?: 'ok' | 'warning' | 'error' | 'idle'
  stale?: boolean
}

export interface ExternalListing {
  id: string
  sourceId: string
  sourceName?: string
  sourceCode?: string
  sourceListingId?: string
  sourceUrl?: string
  offerType: 'sale' | 'rent'
  propertyType: 'flat' | 'house' | 'plot' | 'commercial'
  plotType?: string
  title: string
  description?: string
  locationText?: string
  city?: string
  district?: string
  voivodeship?: string
  price?: number
  pricePerM2?: number
  areaM2?: number
  plotAreaM2?: number
  rooms?: number
  marketType?: string
  latitude?: number | null
  longitude?: number | null
  images?: string[]
  status: 'new' | 'active' | 'updated' | 'inactive' | 'archived'
  firstSeenAt: string
  lastSeenAt: string
  publishedAtSource?: string
}
