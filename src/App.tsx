import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useParams, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Users, Building2, FileText, Settings, LogOut, Menu, X, ChevronDown,
  LayoutDashboard, Briefcase, Target, CalendarDays, Search,
  Activity, BarChart3, Upload, User, Globe, BookOpen, CheckSquare,
  Calculator, MapPin, Mail, TrendingUp, Bot, CircleHelp
} from 'lucide-react'

import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Clients from './components/Clients'
import Properties from './components/Properties'
import Agents from './components/Agents'
import Documents from './components/Documents'
import TasksList from './components/TasksList'
import Leads from './components/Leads'
import LeadDetail from './components/LeadDetail'
import CustomCalendar from './components/Calendar'
import Admin from './components/Admin'
import Marketplace from './components/Marketplace'
import ClientDetail from './components/ClientDetail'
import PropertyDetail from './components/PropertyDetail'
import PropertyCreate from './components/PropertyCreate'
import PDFGenerator from './components/PDFGenerator'
import ActivityFeed from './components/ActivityFeed'
import UserProfile from './components/UserProfile'
import CommandPalette from './components/CommandPalette'
import FileUpload from './components/FileUpload'
import Reports from './components/Reports'
import PortalPublish from './components/PortalPublish'
import Pipeline from './components/Pipeline'
import FinancialCalculator from './components/FinancialCalculator'
import PropertyMap from './components/PropertyMap'
import EmailTemplates from './components/EmailTemplates'
import BusinessSuite from './components/BusinessSuite'
import Help from './components/Help'
import OnboardingModal, { ONBOARDING_STORAGE_KEY } from './components/OnboardingModal'
import ContextHelpButton from './components/ContextHelpButton'
import { useAuthStore } from './store/authStore'
import { useDataStore } from './store/dataStore'
import { apiFetch } from './utils/apiClient'
import mwLogo from '../Logo/mw-logo.svg'
import mwLogoMobileDark from '../Logo/mw-logo-mobile-dark.svg'
import { useThemeStore } from './stores/themeStore'
import { getContextHelp } from './components/helpContent'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, checkAuth, refreshSession } = useAuthStore()
  useEffect(() => {
    checkAuth()
    void refreshSession()
  }, [checkAuth, refreshSession])
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

const RoleRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) => {
  const { user } = useAuthStore()
  if (!user || !allowedRoles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

type NavGroup = {
  label: string
  items: { path: string; icon: React.ElementType; label: string; roles?: string[] }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Główne',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/feed', icon: Activity, label: 'Feed aktywności' },
      { path: '/raporty', icon: BarChart3, label: 'Raporty' },
    ]
  },
  {
    label: 'CRM',
    items: [
      { path: '/klienci', icon: Users, label: 'Klienci' },
      { path: '/leads', icon: Target, label: 'Leady' },
      { path: '/agenci', icon: Briefcase, label: 'Agenci' },
      { path: '/pipeline', icon: TrendingUp, label: 'Pipeline' },
    ]
  },
  {
    label: 'Oferty',
    items: [
      { path: '/nieruchomosci', icon: Building2, label: 'Nieruchomości' },
      { path: '/mapa', icon: MapPin, label: 'Mapa ofert' },
      { path: '/publikacja', icon: Globe, label: 'Publikacja ofert' },
      { path: '/market', icon: Search, label: 'Monitoring' },
    ]
  },
  {
    label: 'Narzędzia',
    items: [
      { path: '/kalkulator', icon: Calculator, label: 'Kalkulator' },
      { path: '/szablony', icon: Mail, label: 'Szablony Email/SMS' },
      { path: '/rozszerzenia', icon: Bot, label: 'Rozszerzenia' },
      { path: '/zadania', icon: CheckSquare, label: 'Zadania' },
      { path: '/kalendarz', icon: CalendarDays, label: 'Kalendarz' },
    ]
  },
  {
    label: 'Dokumenty',
    items: [
      { path: '/dokumenty', icon: FileText, label: 'Dokumenty' },
      { path: '/generator', icon: BookOpen, label: 'Generator (zaaw.)' },
      { path: '/pliki', icon: Upload, label: 'Pliki' },
    ]
  },
  {
    label: 'System',
    items: [
      { path: '/pomoc', icon: CircleHelp, label: 'Pomoc' },
      { path: '/profil', icon: User, label: 'Mój profil' },
      { path: '/admin', icon: Settings, label: 'Admin', roles: ['admin'] },
    ]
  },
]

type SidebarTooltipProps = {
  children: ReactNode
  label: string
  show: boolean
}

const SidebarTooltip = ({ children, label, show }: SidebarTooltipProps) => (
  <div className="group relative flex items-center justify-center overflow-visible">
    {children}
    {show && (
      <div className="pointer-events-none absolute left-full ml-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-2.5 py-1.5 text-xs text-(--text-main) opacity-0 shadow-[0_0_12px_var(--accent-glow)] transition-all duration-200 ease-out delay-100 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1.5 z-50">
        <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-(--border-subtle) bg-(--bg-panel)" />
        <span className="relative z-10">{label}</span>
      </div>
    )}
  </div>
)

type UserMenuProps = {
  userName: string
  role?: string
  initials: string
  avatarUrl?: string
  onLogout: () => void
}

const UserMenu = ({ userName, role, initials, avatarUrl, onLogout }: UserMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-(--border-subtle) hover:bg-(--bg-elev) transition-colors"
      >
        <div className="w-9 h-9 rounded-full border border-(--accent-main) bg-(--bg-elev) overflow-hidden flex items-center justify-center text-(--accent-main) text-sm font-semibold">
          {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : initials}
        </div>
        <ChevronDown size={14} className="text-(--text-dim)" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-md border border-(--border-subtle) bg-(--bg-panel) shadow-[0_0_12px_var(--accent-glow)] z-50">
          <div className="px-3 py-2 border-b border-(--border-subtle)">
            <p className="text-sm text-(--text-main) truncate">{userName}</p>
            <p className="text-xs text-(--text-dim) capitalize">{role || 'user'}</p>
          </div>
          <Link
            to="/profil"
            className="block px-3 py-2 text-sm text-(--text-main) hover:bg-(--bg-elev)"
            onClick={() => setOpen(false)}
          >
            Profil
          </Link>
          <button
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="w-full text-left px-3 py-2 text-sm text-(--accent-danger) hover:bg-(--bg-elev)"
          >
            Wyloguj
          </button>
        </div>
      )}
    </div>
  )
}

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = window.localStorage.getItem('mwpanel:layout')
    if (!saved) return true
    try {
      const parsed = JSON.parse(saved)
      return typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : true
    } catch {
      return true
    }
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = window.localStorage.getItem('mwpanel:layout')
    if (!saved) return false
    try {
      const parsed = JSON.parse(saved)
      return typeof parsed.sidebarCollapsed === 'boolean' ? parsed.sidebarCollapsed : false
    } catch {
      return false
    }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [monitoringNewCount, setMonitoringNewCount] = useState(0)
  const [activeOffersCount, setActiveOffersCount] = useState(0)
  const { user, profile, logout } = useAuthStore()
  const { clients, tasks } = useDataStore()
  const { syncThemeForUser, resolvedTheme } = useThemeStore()
  const location = useLocation()
  const navigate = useNavigate()
  const contextHelp = getContextHelp(location.pathname)

  useEffect(() => { setMobileMenuOpen(false); setCommandOpen(false) }, [location])

  useEffect(() => {
    if (location.pathname === '/pomoc') {
      setHelpOpen(true)
      navigate('/', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const completed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!completed) {
      setOnboardingOpen(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('mwpanel:layout', JSON.stringify({
      sidebarOpen,
      sidebarCollapsed,
      layoutMode: sidebarCollapsed ? 'compact' : 'full',
    }))
  }, [sidebarOpen, sidebarCollapsed])

  useEffect(() => {
    syncThemeForUser(user?.id || null)
  }, [user?.id, syncThemeForUser])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k'
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault()
        setCommandOpen(true)
      } else if (e.key === 'Escape') {
        setCommandOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const loadMonitoringNewCount = async () => {
      try {
        const rows = await apiFetch<any[]>('/external-listings?onlyNew=1')
        setMonitoringNewCount(rows.length)
      } catch {
        setMonitoringNewCount(0)
      }
    }

    const loadListingStats = async () => {
      try {
        const agencyId = user?.agencyId
        const query = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : ''
        const stats = await apiFetch<{ activeOffers?: number }>(`/dashboard/listing-stats${query}`)
        setActiveOffersCount(Number(stats?.activeOffers || 0))
      } catch {
        setActiveOffersCount(0)
      }
    }

    void loadMonitoringNewCount()
    void loadListingStats()
    const id = setInterval(() => {
      void loadMonitoringNewCount()
      void loadListingStats()
    }, 20000)
    return () => clearInterval(id)
  }, [user?.agencyId])


  const userInitials = profile
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : user?.email.slice(0, 2).toUpperCase() || 'U'

  const NavLinks = ({ mobile = false, collapsed = false }: { mobile?: boolean; collapsed?: boolean }) => (
    <>
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="nav-group mb-4">
          {!collapsed && (
            <p className="nav-group__label mb-1 text-xs font-semibold text-(--text-dead) uppercase tracking-wider">
              {group.label}
            </p>
          )}
          {group.items.map(item => {
            if (item.roles && !item.roles.includes(user?.role || '')) return null
            const isHelpItem = item.path === '/pomoc'
            const isActive = isHelpItem
              ? helpOpen
              : location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            const baseClass = `nav-item nav-item--${collapsed ? 'collapsed' : 'expanded'} relative flex w-full items-center rounded-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] mb-0.5 ${
              isActive
                ? collapsed
                  ? 'text-(--accent-main) bg-(--accent-main)/12 shadow-[0_0_18px_var(--accent-glow)] ring-1 ring-(--accent-main)/30 scale-[1.035] -translate-y-[1px]'
                  : 'active'
                : collapsed
                  ? 'text-(--text-dim) hover:bg-(--bg-elev) hover:text-(--text-main) hover:scale-[1.025] hover:-translate-y-[1px]'
                  : 'text-(--text-dim) hover:bg-(--bg-elev) hover:text-(--text-main)'
            }`

            return (
              <SidebarTooltip key={item.path} label={item.label} show={collapsed && !mobile}>
                {isHelpItem ? (
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    className={`${baseClass} w-full`}
                  >
                    <span className={`nav-item__icon relative inline-flex items-center justify-center shrink-0 ${collapsed && isActive ? 'after:absolute after:inset-[-8px] after:rounded-2xl after:bg-(--accent-main)/8 after:blur-md after:content-[""]' : ''}`}>
                      <item.icon size={18} className="relative z-10" />
                    </span>
                    {!collapsed && <span className="nav-item__label text-sm font-medium whitespace-nowrap">{item.label}</span>}
                  </button>
                ) : (
                  <Link
                    to={item.path}
                    className={baseClass}
                  >
                    <span className={`nav-item__icon relative inline-flex items-center justify-center shrink-0 ${collapsed && isActive ? 'after:absolute after:inset-[-8px] after:rounded-2xl after:bg-(--accent-main)/8 after:blur-md after:content-[""]' : ''}`}>
                      <item.icon size={18} className="relative z-10" />
                    </span>
                    {!collapsed && <span className="nav-item__label text-sm font-medium whitespace-nowrap">{item.label}</span>}
                    {item.path === '/market' && monitoringNewCount > 0 ? (
                      <span className={`nav-item__badge ${collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'} text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        isActive
                          ? 'border-(--accent-main) text-(--accent-main) bg-(--accent-main)/10'
                          : 'border-(--border-strong) text-(--accent-warn) bg-(--accent-warn)/10'
                      }`}>
                        {monitoringNewCount}
                      </span>
                    ) : null}
                  </Link>
                )}
              </SidebarTooltip>
            )
          })}
        </div>
      ))}
    </>
  )

  return (
    <div className="cyber-shell min-h-screen transition-colors duration-150">
      {/* Header */}
      <header className="h-14 bg-(--bg-panel) px-3 md:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors duration-150">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex lg:hidden items-center justify-center p-2 rounded-md border border-(--border-subtle) bg-(--bg-elev) text-(--accent-main) hover:bg-(--bg-panel) transition-colors"
            aria-label="Otwórz menu"
            title="Menu"
          >
            <Menu size={16} />
          </button>
          <button
            onClick={() => {
              if (!sidebarOpen) {
                setSidebarOpen(true)
                setSidebarCollapsed(true)
                return
              }
              setSidebarCollapsed((v) => !v)
            }}
            className="p-2 hover:bg-(--bg-elev) rounded-md hidden lg:flex transition-colors"
            aria-label="Przełącz panel boczny"
            title="Przełącz panel boczny"
          >
            <Menu size={20} className="text-(--text-dim)" />
          </button>
          <div className="flex items-center min-w-0 overflow-visible">
            <a
              href="https://mwpartner.pl"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-start overflow-visible pr-2"
              title="Otwórz mwpartner.pl"
            >
              <img
                src={resolvedTheme === 'dark' ? mwLogoMobileDark : mwLogo}
                alt="MW Partner Nieruchomości"
                className="h-8 max-w-[calc(100vw-88px)] w-auto object-contain md:hidden shrink-0"
              />
              <img
                src={mwLogo}
                alt="MW Partner Nieruchomości"
                className="h-9 max-w-[260px] w-auto object-contain hidden md:block shrink-0"
              />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">          
          <ContextHelpButton help={contextHelp} />

          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-(--border-subtle)">
            <UserMenu
              userName={profile ? `${profile.firstName} ${profile.lastName}` : user?.email?.split('@')[0] || 'Użytkownik'}
              role={user?.role}
              initials={userInitials}
              avatarUrl={(profile as any)?.avatar}
              onLogout={() => void logout()}
            />
          </div>
        </div>
      </header>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
      <OnboardingModal open={onboardingOpen} onClose={() => setOnboardingOpen(false)} onComplete={() => setOnboardingOpen(false)} />

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="sidebar w-72 h-full p-4 overflow-y-auto transition-colors duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-(--border-subtle)">
              <div className="relative w-8 h-8 rounded-md border border-(--accent-main) bg-(--bg-elev) flex items-center justify-center shadow-[0_0_12px_var(--accent-glow)]">
                <Building2 className="text-(--accent-main)" size={17} />
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-(--accent-main) opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-(--accent-main)"></span>
                </span>
              </div>
              <span className="font-bold text-(--text-main)">MWPanel</span>
            </div>
            <NavLinks mobile />
            <div className="pt-4 mt-2 border-t border-(--border-subtle)">
              <button
                onClick={() => logout()}
                className="nav-item nav-item--expanded nav-item--danger text-red-600 dark:text-red-400 w-full"
              >
                <LogOut size={18} />
                <span className="text-sm font-medium">Wyloguj się</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        {sidebarOpen && (
          <aside className={`sidebar hidden lg:block fixed left-0 top-14 bottom-0 z-20 overflow-y-auto transition-all duration-300 ease-out ${sidebarCollapsed ? 'w-20' : 'w-60'}`}>
            <div className="p-3 pt-4">
              <NavLinks collapsed={sidebarCollapsed} />
            </div>
            {!sidebarCollapsed && (
              <div className="p-3 border-t border-(--border-subtle)">
                <div className="card p-4">
                  <p className="text-xs font-semibold text-(--accent-main) mb-2">Twój panel</p>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { label: 'Aktywne oferty', value: String(activeOffersCount) },
                      { label: 'Klienci', value: String(clients.length) },
                      { label: 'Zadania', value: String(tasks.length) },
                    ].map(s => (
                      <div key={s.label} className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
                        <strong className="text-gray-800 dark:text-white">{s.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <main className={`flex-1 ${sidebarOpen ? (sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-60') : ''} px-3 md:px-6 pt-0 md:pt-4 pb-4 md:pb-6 min-h-screen bg-(--bg-main) transition-all duration-300 ease-out`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/klienci" element={<Clients />} />
            <Route path="/klienci/:id" element={<ClientDetail />} />
            <Route path="/nieruchomosci" element={<Properties />} />
            <Route path="/nieruchomosci/nowa" element={<PropertyCreate />} />
            <Route path="/nieruchomosci/:id" element={<PropertyDetail />} />
            <Route path="/agenci" element={<Agents />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/zadania" element={<TasksList />} />
            <Route path="/kalendarz" element={<CustomCalendar />} />
            <Route path="/dokumenty" element={<Documents />} />
            <Route path="/dokumenty/preview/:type/:id" element={<LegacyDocumentPreviewRedirect />} />
            <Route path="/generator" element={<PDFGenerator />} />
            <Route path="/pliki" element={<FileUpload />} />
            <Route path="/feed" element={<ActivityFeed />} />
            <Route path="/profil" element={<UserProfile />} />
            <Route path="/raporty" element={<Reports />} />
            <Route path="/publikacja" element={<PortalPublish />} />
            <Route path="/market" element={<Marketplace />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/kalkulator" element={<FinancialCalculator />} />
            <Route path="/mapa" element={<PropertyMap />} />
            <Route path="/szablony" element={<EmailTemplates />} />
            <Route path="/rozszerzenia" element={<BusinessSuite />} />
            <Route
              path="/admin"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <Admin />
                </RoleRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

const LegacyDocumentPreviewRedirect = () => {
  const { type, id } = useParams<{ type: string; id: string }>()
  const legacyTypeToTemplate: Record<string, string> = {
    'umowa-posrednictwa': 'UP',
    'protokol-prezentacji': 'PP',
    'karta-nieruchomosci': 'KN',
    rezerwacja: 'PR',
    'zlecenie-poszukiwania': 'ZP',
  }
  const template = legacyTypeToTemplate[type || ''] || 'UP'
  const query = new URLSearchParams({ template })
  if (id) {
    query.set('documentId', id)
  }
  return <Navigate to={`/generator?${query.toString()}`} replace />
}

function App() {
  const { isAuthenticated, user } = useAuthStore()
  const { fetchClients, fetchProperties, fetchListings, fetchTasks, fetchDocuments, fetchActivities, fetchNotifications } = useDataStore()

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchClients()
      fetchProperties()
      fetchListings()
      fetchTasks()
      fetchDocuments()
      fetchActivities()
      fetchNotifications()
    }
  }, [isAuthenticated, user, fetchClients, fetchProperties, fetchListings, fetchTasks, fetchDocuments, fetchActivities, fetchNotifications])

  return (
    <BrowserRouter>
      {import.meta.env.DEV ? (
        <div data-testid="utf8-probe" className="sr-only">
          Zarządzanie
        </div>
      ) : null}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
