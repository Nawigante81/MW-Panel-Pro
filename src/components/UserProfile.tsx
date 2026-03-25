import { useRef, useState } from 'react'
import { User, Mail, Phone, MapPin, Shield, Bell, Key, Save, Camera, Building2, Award, Clock, Sun, Moon, Monitor } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../stores/themeStore'

export default function UserProfile() {
  const { user, profile, setProfile } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile')
  const [saved, setSaved] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>((profile as any)?.avatar || null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    firstName: profile?.firstName || 'Anna',
    lastName: profile?.lastName || 'Kowalska',
    email: user?.email || 'anna.kowalska@mwpanel.pl',
    phone: '+48 500 123 456',
    city: 'Warszawa',
    address: 'ul. Złota 44',
    bio: 'Agent nieruchomości z 5-letnim doświadczeniem, specjalizuję się w rynku warszawskim.',
    license: 'PL-2024-AG-0042',
    agency: 'MWPanel Nieruchomości Sp. z o.o.',
  })

  const [notifications, setNotifications] = useState({
    newLead: true,
    newTask: true,
    taskDue: true,
    documentSigned: true,
    priceChange: false,
    newMessage: true,
    weeklyReport: false,
    systemUpdates: true,
  })

  const [passwords, setPasswords] = useState({
    current: '',
    newPass: '',
    confirm: '',
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const onPickAvatar = () => {
    avatarInputRef.current?.click()
  }

  const onAvatarChange = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 3 * 1024 * 1024) {
      alert('Maksymalny rozmiar avataru to 3MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null
      if (!dataUrl) return
      setAvatarPreview(dataUrl)
      setProfile({ ...(profile as any), avatar: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  const initials = `${form.firstName[0]}${form.lastName[0]}`.toUpperCase()

  const stats = [
    { label: 'Aktywne oferty', value: '24', icon: Building2, color: 'blue' },
    { label: 'Klienci', value: '156', icon: User, color: 'green' },
    { label: 'Dokumenty', value: '89', icon: Award, color: 'purple' },
    { label: 'Dni w systemie', value: '342', icon: Clock, color: 'orange' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Profil użytkownika</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Zarządzaj swoimi danymi i ustawieniami</p>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative shrink-0">
            <div className="w-24 h-24 bg-linear-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar użytkownika" className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              title="Prześlij zdjęcie profilowe"
              className="hidden"
              onChange={onAvatarChange}
            />
            <button onClick={onPickAvatar} title="Zmień zdjęcie profilowe" className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white shadow-md transition-colors">
              <Camera size={14} />
            </button>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{form.firstName} {form.lastName}</h2>
            <p className="text-gray-500 dark:text-gray-400">{form.email}</p>
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                user?.role === 'admin' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                user?.role === 'manager' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              }`}>
                {user?.role === 'admin' ? 'Administrator' : user?.role === 'manager' ? 'Manager' : 'Agent'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Shield size={12} /> Licencja: {form.license}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          {stats.map(stat => (
            <div key={stat.label} className="text-center">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 ${
                stat.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                stat.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                stat.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30' :
                'bg-orange-100 dark:bg-orange-900/30'
              }`}>
                <stat.icon size={18} className={
                  stat.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                  stat.color === 'green' ? 'text-green-600 dark:text-green-400' :
                  stat.color === 'purple' ? 'text-purple-600 dark:text-purple-400' :
                  'text-orange-600 dark:text-orange-400'
                } />
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
        {[
          { key: 'profile', label: 'Dane profilu', icon: User },
          { key: 'security', label: 'Bezpieczeństwo', icon: Key },
          { key: 'notifications', label: 'Powiadomienia', icon: Bell },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-5">Dane osobowe</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'firstName', label: 'Imię', icon: User },
              { key: 'lastName', label: 'Nazwisko', icon: User },
              { key: 'email', label: 'Adres email', icon: Mail, type: 'email' },
              { key: 'phone', label: 'Telefon', icon: Phone },
              { key: 'city', label: 'Miasto', icon: MapPin },
              { key: 'address', label: 'Adres', icon: MapPin },
              { key: 'license', label: 'Nr licencji', icon: Award },
              { key: 'agency', label: 'Agencja', icon: Building2 },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{field.label}</label>
                <div className="relative">
                  <field.icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={field.type || 'text'}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    title={field.label}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio / O sobie</label>
              <textarea
                rows={3}
                value={form.bio}
                onChange={e => setForm(prev => ({ ...prev, bio: e.target.value }))}
                title="Bio / O sobie"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/30">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Motyw interfejsu</h4>
            <div className="inline-flex items-center gap-1 bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
              {[
                { mode: 'light' as const, Icon: Sun, label: 'Jasny' },
                { mode: 'dark' as const, Icon: Moon, label: 'Ciemny' },
                { mode: 'system' as const, Icon: Monitor, label: 'Systemowy' },
              ].map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  title={label}
                  className={`px-3 py-2 rounded-md text-sm inline-flex items-center gap-2 transition-all ${
                    theme === mode
                      ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-600/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Ustawienie zapisywane per użytkownik i stosowane po zalogowaniu.</p>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Save size={16} />
              {saved ? '✓ Zapisano!' : 'Zapisz zmiany'}
            </button>
            {saved && <span className="text-sm text-green-600 dark:text-green-400">Profil zaktualizowany</span>}
          </div>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-5">Zmiana hasła</h3>
          <div className="max-w-md space-y-4">
            {[
              { key: 'current', label: 'Aktualne hasło' },
              { key: 'newPass', label: 'Nowe hasło' },
              { key: 'confirm', label: 'Powtórz nowe hasło' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{field.label}</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={passwords[field.key as keyof typeof passwords]}
                    onChange={e => setPasswords(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            ))}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300">Hasło powinno mieć minimum 8 znaków, zawierać wielką literę i cyfrę.</p>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
              <Key size={16} />
              {saved ? '✓ Zmieniono!' : 'Zmień hasło'}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Sesje i bezpieczeństwo</h3>
            <div className="space-y-3">
              {[
                { device: 'Chrome / Windows 11', location: 'Warszawa, Polska', time: 'Aktywna teraz', current: true },
                { device: 'Safari / iPhone 15', location: 'Warszawa, Polska', time: '2 godz. temu', current: false },
              ].map((session, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{session.device}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{session.location} · {session.time}</p>
                  </div>
                  {session.current ? (
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Bieżąca</span>
                  ) : (
                    <button
                      disabled
                      title="Funkcja niedostępna — zarządzanie sesjami w przygotowaniu"
                      className="text-xs text-gray-400 cursor-not-allowed"
                    >Wyloguj</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-5">Preferencje powiadomień</h3>
          <div className="space-y-4">
            {[
              { key: 'newLead', label: 'Nowy lead', desc: 'Powiadomienie gdy pojawi się nowy lead przypisany do Ciebie' },
              { key: 'newTask', label: 'Nowe zadanie', desc: 'Powiadomienie gdy zostanie przypisane nowe zadanie' },
              { key: 'taskDue', label: 'Termin zadania', desc: 'Przypomnienie 24h przed terminem zadania' },
              { key: 'documentSigned', label: 'Podpisany dokument', desc: 'Gdy klient podpisze dokument' },
              { key: 'priceChange', label: 'Zmiana ceny', desc: 'Monitoring zmian cen w obserwowanych ofertach' },
              { key: 'newMessage', label: 'Nowa wiadomość', desc: 'Gdy otrzymasz wiadomość od klienta lub agenta' },
              { key: 'weeklyReport', label: 'Tygodniowy raport', desc: 'Podsumowanie aktywności co poniedziałek' },
              { key: 'systemUpdates', label: 'Aktualizacje systemu', desc: 'Informacje o nowych funkcjach MWPanel' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{item.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifications(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                  title={`Przełącz powiadomienie: ${item.label}`}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
                    notifications[item.key as keyof typeof notifications] ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    notifications[item.key as keyof typeof notifications] ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
            <Save size={16} />
            {saved ? '✓ Zapisano!' : 'Zapisz ustawienia'}
          </button>
        </div>
      )}
    </div>
  )
}
