import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Lock, Mail, AlertCircle, Eye, EyeOff,
  Sun, Moon, Monitor, ChevronRight, Shield, Sparkles, KeyRound
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../stores/themeStore'
import { apiFetch } from '../utils/apiClient'
import mwLogo from '../../Logo/mw-logo.svg'
import mwLogoMobileDark from '../../Logo/mw-logo-mobile-dark.svg'
import logoPanelPro from '../../Logo/logopanelpro.png'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotInfo, setForgotInfo] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const forgotModalRef = useRef<HTMLDivElement | null>(null)
  const forgotTriggerRef = useRef<HTMLButtonElement | null>(null)
  const { login, register } = useAuthStore()
  const { theme, setTheme, resolvedTheme } = useThemeStore()
  const navigate = useNavigate()

  const isDark = resolvedTheme === 'dark'
  const trimmedEmail = email.trim().toLowerCase()
  const emailTouched = email.length > 0
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)

  useEffect(() => {
    const savedEmail = localStorage.getItem('mwpanel:last-email')
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    if (!forgotOpen) {
      forgotTriggerRef.current?.focus()
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const focusFirst = () => {
      const root = forgotModalRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
      nodes[0]?.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setForgotOpen(false)
        return
      }

      if (event.key !== 'Tab') return
      const root = forgotModalRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
      if (!nodes.length) return

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const timer = window.setTimeout(focusFirst, 10)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [forgotOpen])

  const parsedError = useMemo(() => {
    const normalized = error.toLowerCase()
    if (!error) return null
    if (!emailLooksValid && emailTouched) {
      return { title: 'Nieprawidłowy adres e-mail', body: 'Sprawdź format adresu i spróbuj ponownie.', tone: 'warning' as const }
    }
    if (normalized.includes('locked') || normalized.includes('zablok') || normalized.includes('inactive')) {
      return { title: 'Konto jest zablokowane', body: error, tone: 'danger' as const }
    }
    if (normalized.includes('invalid credentials') || normalized.includes('błąd logowania') || normalized.includes('hasło') || normalized.includes('password')) {
      return { title: 'Nieprawidłowy e-mail lub hasło', body: error, tone: 'danger' as const }
    }
    return { title: mode === 'login' ? 'Nie udało się zalogować' : 'Nie udało się utworzyć konta', body: error, tone: 'danger' as const }
  }, [error, emailLooksValid, emailTouched, mode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!emailLooksValid) {
      setError('Nieprawidłowy adres e-mail')
      return
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Hasła nie są takie same')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(trimmedEmail, password)
        if (rememberMe) {
          localStorage.setItem('mwpanel:last-email', trimmedEmail)
        } else {
          localStorage.removeItem('mwpanel:last-email')
        }
      } else {
        await register({ email: trimmedEmail, password, firstName, lastName })
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? 'Błąd logowania' : 'Błąd rejestracji')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Podaj adres e-mail')
      return
    }
    try {
      setForgotLoading(true)
      setForgotError('')
      const result = await apiFetch<{ message: string; debugResetToken?: string }>('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      })
      setForgotInfo(result.message)
      if (result.debugResetToken) {
        setResetToken(result.debugResetToken)
      }
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Nie udało się rozpocząć resetu hasła')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetToken.trim()) {
      setForgotError('Brak tokenu resetu hasła')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('Nowe hasła nie są takie same')
      return
    }
    try {
      setResetLoading(true)
      setForgotError('')
      const result = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), password: newPassword }),
      })
      setForgotInfo(result.message)
      setNewPassword('')
      setConfirmNewPassword('')
      setResetToken('')
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Nie udało się zresetować hasła')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex transition-colors duration-300 relative overflow-hidden ${
      isDark ? 'bg-[#050912]' : 'bg-linear-to-br from-slate-100 via-blue-50 to-indigo-100'
    }`}>
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(0,255,198,0.10),transparent_36%),radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.10),transparent_32%),radial-gradient(circle_at_52%_86%,rgba(168,85,247,0.08),transparent_34%),linear-gradient(160deg,#060a12_0%,#0b1320_56%,#09101b_100%)]" />
        <div className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-size-[48px_48px]" />
      </div>

      <div className={`hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-10 xl:p-12 z-10 ${
        isDark
          ? 'bg-linear-to-br from-[#08111d] via-[#0c1526] to-[#10192c]'
          : 'bg-linear-to-br from-blue-700 via-blue-800 to-indigo-900'
      }`}>
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.14),transparent_30%),radial-gradient(circle_at_70%_30%,rgba(6,182,212,0.10),transparent_35%),radial-gradient(circle_at_40%_70%,rgba(59,130,246,0.06),transparent_40%)]" />
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-20 w-md h-112 rounded-full blur-3xl bg-blue-500/15 transition-transform duration-[3000ms]" />
          <div className="absolute top-10 -right-24 w-[24rem] h-96 rounded-full blur-3xl bg-cyan-400/10 transition-transform duration-[3000ms]" />
          <div className="absolute -bottom-32 left-[28%] w-104 h-104 rounded-full blur-3xl bg-indigo-500/10 transition-transform duration-[3000ms]" />
        </div>

        <div className="relative z-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="relative overflow-hidden rounded-lg">
              <img src={mwLogo} alt="MWPanel logo" className="h-11 w-auto object-contain" />
            </div>
          </div>

          <div className="space-y-4 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-cyan-100/80 backdrop-blur-sm">
              <Sparkles size={12} />
              MW Panel CRM System
            </span>
            <h2 className="text-4xl xl:text-[2.9rem] font-bold text-white leading-tight tracking-tight">
              CRM dla nowoczesnego biura nieruchomości
            </h2>
            <p className="text-blue-100/80 text-base xl:text-lg leading-relaxed">
              Oferty, klienci, dokumenty i monitoring rynku w jednym miejscu — czytelnie, szybko i bez chaosu.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-w-2xl">
            {[
              { title: 'Oferty i publikacja', text: 'Zarządzaj nieruchomościami, publikacją i monitoringiem rynku.' },
              { title: 'CRM i leady', text: 'Prowadź klientów, aktywności i follow-up w jednym panelu.' },
              { title: 'Dokumenty', text: 'Generuj dokumenty i przechowuj pliki bez przeskakiwania między narzędziami.' },
              { title: 'Codzienna operacja', text: 'Szybki dostęp do zadań, kalendarza i procesów sprzedażowych.' },
            ].map((item) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:border-cyan-300/30"
              >
                <p className="text-white text-sm font-semibold mb-1.5">{item.title}</p>
                <p className="text-blue-100/70 text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center px-6 pointer-events-none select-none">
          <img
            src={logoPanelPro}
            alt="Logo Panel Pro"
            className="w-[128%] max-w-[1300px] h-auto object-contain opacity-[0.07] saturate-0 contrast-125 brightness-150 animate-pulse"
          />
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/65 mb-2">Dostęp bezpieczny</p>
            <p className="text-sm text-blue-100/75 leading-relaxed">
              Zaloguj się, aby przejść do panelu MW Panel. Interfejs został uproszczony, ale logika autoryzacji i backend pozostały bez zmian.
            </p>
          </div>
        </div>
      </div>

      <div className={`flex-1 min-h-screen flex flex-col justify-start lg:justify-center items-center p-4 sm:p-6 lg:p-10 xl:p-12 pt-10 sm:pt-12 lg:pt-10 xl:pt-12 relative z-10 ${
        isDark ? 'bg-transparent' : 'bg-white/80'
      }`}>
        <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20">
          <div className={`hidden md:flex items-center gap-1 p-1 rounded-xl border ${
            isDark ? 'bg-[#0f172a] border-white/10' : 'bg-gray-100 border-gray-200'
          }`}>
            {[
              { mode: 'light' as const, Icon: Sun, label: 'Jasny' },
              { mode: 'dark' as const, Icon: Moon, label: 'Ciemny' },
              { mode: 'system' as const, Icon: Monitor, label: 'System' },
            ].map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                title={label}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  theme === mode
                    ? isDark
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-white text-blue-600 shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          <div className="md:hidden relative">
            <button
              onClick={() => setThemeMenuOpen((v) => !v)}
              className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                isDark ? 'bg-[#0f172a] border-white/10 text-slate-200' : 'bg-white border-gray-200 text-gray-700'
              }`}
              aria-label="Zmień motyw"
            >
              {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
            </button>

            {themeMenuOpen ? (
              <div className={`absolute right-0 mt-2 min-w-40 rounded-xl border shadow-xl p-1.5 ${
                isDark ? 'bg-[#0f172a] border-white/10' : 'bg-white border-gray-200'
              }`}>
                {[
                  { mode: 'light' as const, Icon: Sun, label: 'Jasny' },
                  { mode: 'dark' as const, Icon: Moon, label: 'Ciemny' },
                  { mode: 'system' as const, Icon: Monitor, label: 'System' },
                ].map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => { setTheme(mode); setThemeMenuOpen(false) }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm ${
                      theme === mode
                        ? isDark
                          ? 'bg-blue-600/20 text-blue-300'
                          : 'bg-blue-50 text-blue-700'
                        : isDark
                          ? 'text-slate-300 hover:bg-white/5'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2"><Icon size={14} /> {label}</span>
                    {theme === mode ? <span className="text-[10px]">AKTYWNY</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:hidden w-full max-w-md mb-4">
          <div className="flex items-center gap-3">
            <div className="relative overflow-hidden rounded-lg">
              <img src={isDark ? mwLogoMobileDark : mwLogo} alt="MW Partner Nieruchomości" className="h-10 w-auto object-contain" />
            </div>
          </div>
        </div>

        <div className={`w-full max-w-md translate-y-[2.3cm] sm:translate-y-[2.3cm] lg:translate-y-0 rounded-[22px] border p-5 sm:p-6 md:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.38)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(0,0,0,0.42)] ${
          isDark
            ? 'bg-[rgba(8,12,20,0.78)] border-cyan-300/[0.14] backdrop-blur-[14px]'
            : 'bg-white border-gray-200'
        }`}>
          <div className="mb-6 transition-all duration-300 animate-[fadeInUp_.45s_ease-out]">
            <h2 className={`text-3xl font-bold mb-1.5 ${isDark ? 'text-[#f8fafc]' : 'text-gray-900'}`}>
              {mode === 'login' ? 'Witaj ponownie' : 'Załóż konto'}
            </h2>
            <p className={`${isDark ? 'text-[#94a3b8]' : 'text-gray-500'} text-sm leading-relaxed`}>
              {mode === 'login' ? 'Zaloguj się do swojego panelu MW Panel.' : 'Utwórz konto użytkownika przez adres e-mail.'}
            </p>
          </div>

          <div className={`flex items-center gap-2 p-1 rounded-xl border mb-6 ${
            isDark ? 'bg-[#111827] border-white/10' : 'bg-gray-50 border-gray-200'
          }`}>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login'
                  ? isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-blue-700 shadow-sm'
                  : isDark ? 'text-[#94a3b8]' : 'text-gray-600'
              }`}
            >
              Logowanie
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'register'
                  ? isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white text-blue-700 shadow-sm'
                  : isDark ? 'text-[#94a3b8]' : 'text-gray-600'
              }`}
            >
              Załóż konto
            </button>
          </div>

          {parsedError && (
            <div className={`mb-5 rounded-xl border px-4 py-3 ${
              parsedError.tone === 'warning'
                ? isDark ? 'border-amber-500/30 bg-amber-950/25 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'
                : isDark ? 'border-red-700/40 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{parsedError.title}</p>
                  <p className="text-sm opacity-90 mt-0.5">{parsedError.body}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4.5 animate-[fadeInUp_.55s_ease-out]">
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#cbd5e1]' : 'text-gray-700'}`}>
                    Imię
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)] ${
                      isDark
                        ? 'bg-[#0b1220] border-white/15 text-white placeholder-white/50'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                    placeholder="Jan"
                    required={mode === 'register'}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#cbd5e1]' : 'text-gray-700'}`}>
                    Nazwisko
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)] ${
                      isDark
                        ? 'bg-[#0b1220] border-white/15 text-white placeholder-white/50'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                    placeholder="Kowalski"
                    required={mode === 'register'}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#cbd5e1]' : 'text-gray-700'}`}>
                Adres e-mail
              </label>
              <div className="relative">
                <Mail size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#64748b]' : 'text-gray-400'}`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)] ${
                    !emailLooksValid && emailTouched
                      ? isDark
                        ? 'bg-[#0b1220] border-red-500/60 text-white placeholder-white/50'
                        : 'bg-red-50 border-red-300 text-gray-900 placeholder-gray-400'
                      : isDark
                        ? 'bg-[#0b1220] border-white/15 text-white placeholder-white/50'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  placeholder="twoj@email.pl"
                  required
                />
              </div>
              {!emailLooksValid && emailTouched && (
                <p className="mt-1.5 text-xs text-red-400">Podaj poprawny adres e-mail.</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`text-sm font-medium ${isDark ? 'text-[#cbd5e1]' : 'text-gray-700'}`}>
                  Hasło
                </label>
                <button
                  ref={forgotTriggerRef}
                  type="button"
                  onClick={() => {
                    setForgotOpen(true)
                    setForgotError('')
                    setForgotInfo('')
                    setForgotEmail(email)
                  }}
                  className={`text-xs font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  Nie pamiętasz hasła?
                </button>
              </div>
              <div className="relative">
                <Lock size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#64748b]' : 'text-gray-400'}`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)] ${
                    isDark
                      ? 'bg-[#0b1220] border-white/15 text-white placeholder-white/50'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 ${isDark ? 'text-[#64748b] hover:text-[#cbd5e1]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label className={`inline-flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-[#0b1220] text-cyan-400 focus:ring-cyan-400/30"
                  />
                  Zapamiętaj mnie
                </label>
                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Bez zmian w logice sesji</span>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#cbd5e1]' : 'text-gray-700'}`}>
                  Powtórz hasło
                </label>
                <div className="relative">
                  <Lock size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#64748b]' : 'text-gray-400'}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.08)] ${
                      isDark
                        ? 'bg-[#0b1220] border-white/15 text-white placeholder-white/50'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                    placeholder="••••••••"
                    required={mode === 'register'}
                  />
                </div>
              </div>
            )}

            {parsedError?.title === 'Konto jest zablokowane' && (
              <div className={`rounded-xl border px-4 py-3 ${isDark ? 'border-amber-500/25 bg-amber-950/25 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="flex items-start gap-3">
                  <Shield size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Konto wymaga odblokowania</p>
                    <p className="text-sm opacity-90 mt-0.5">Skontaktuj się z administratorem albo użyj resetu hasła, jeśli konto zostało zablokowane po nieudanych próbach logowania.</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                loading
                  ? 'opacity-70 cursor-not-allowed'
                  : 'hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(34,211,238,0.22)] active:scale-[0.99]'
              } text-white bg-linear-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-900/30 focus:outline-none focus:ring-2 focus:ring-blue-400/70`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'Logowanie...' : 'Tworzenie konta...'}
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          {forgotOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setForgotOpen(false)}
            >
              <div
                ref={forgotModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="forgot-password-title"
                className={`w-full max-w-lg rounded-2xl border p-5 sm:p-6 space-y-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-[fadeInUp_.22s_ease-out] ${isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="forgot-password-title" className="text-lg font-semibold">Reset hasła</h3>
                    <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Wyślij instrukcję resetu albo ustaw nowe hasło z użyciem tokenu.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Zamknij
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-gray-50/70'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Mail size={16} className={isDark ? 'text-cyan-300' : 'text-blue-600'} />
                      <p className="text-sm font-semibold">Krok 1 — wyślij instrukcję resetu</p>
                    </div>
                    <label className="text-sm font-medium">E-mail konta</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className={`mt-2 w-full px-3 py-2.5 rounded-xl border transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 ${isDark ? 'bg-[#0b1220] border-white/15 placeholder-white/50' : 'bg-white border-gray-300'}`}
                      placeholder="twoj@email.pl"
                    />
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={forgotLoading}
                      className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01]"
                    >
                      {forgotLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <KeyRound size={16} />}
                      {forgotLoading ? 'Wysyłanie...' : 'Wyślij instrukcję resetu'}
                    </button>
                    <div className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      Jeśli konto istnieje, instrukcja resetu zostanie wysłana. W trybie developerskim token pojawi się poniżej.
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-gray-50/70'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound size={16} className={isDark ? 'text-cyan-300' : 'text-blue-600'} />
                      <p className="text-sm font-semibold">Krok 2 — ustaw nowe hasło</p>
                    </div>

                    {resetToken && (
                      <div className="space-y-2 rounded-xl border border-blue-300/30 bg-blue-50/60 dark:bg-blue-900/20 p-3 mb-3">
                        <label className="text-sm font-medium">Token resetu</label>
                        <input
                          type="text"
                          value={resetToken}
                          onChange={(e) => setResetToken(e.target.value)}
                          title="Token resetu"
                          className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-[#0b1220] border-white/20' : 'bg-white border-gray-300'}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(resetToken)
                            setForgotInfo('Token skopiowany do schowka.')
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Kopiuj token
                        </button>
                      </div>
                    )}

                    {!resetToken && (
                      <input
                        type="text"
                        placeholder="Wklej token resetu"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className={`mb-3 w-full px-3 py-2.5 rounded-xl border transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 ${isDark ? 'bg-[#0b1220] border-white/15 placeholder-white/50' : 'bg-white border-gray-300'}`}
                      />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="password"
                        placeholder="Nowe hasło"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={`px-3 py-2.5 rounded-xl border transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 ${isDark ? 'bg-[#0b1220] border-white/15 placeholder-white/50' : 'bg-white border-gray-300'}`}
                      />
                      <input
                        type="password"
                        placeholder="Powtórz nowe hasło"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className={`px-3 py-2.5 rounded-xl border transition-all duration-200 focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 ${isDark ? 'bg-[#0b1220] border-white/15 placeholder-white/50' : 'bg-white border-gray-300'}`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={resetLoading}
                      className="mt-3 w-full py-2.5 rounded-xl border border-blue-500 text-blue-600 dark:text-blue-300 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01]"
                    >
                      {resetLoading ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <KeyRound size={16} />}
                      {resetLoading ? 'Resetowanie...' : 'Ustaw nowe hasło'}
                    </button>
                  </div>
                </div>

                {forgotError && <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">{forgotError}</div>}
                {forgotInfo && <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-400">{forgotInfo}</div>}
              </div>
            </div>
          )}

          <p className={`text-center text-xs mt-6 ${isDark ? 'text-[#64748b]' : 'text-gray-400'}`}>
            © MWPanel · CRM System
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
