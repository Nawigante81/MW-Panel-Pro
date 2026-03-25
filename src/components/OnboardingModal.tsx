import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react'

type OnboardingModalProps = {
  open: boolean
  onClose: () => void
  onComplete?: () => void
}

type OnboardingStep = {
  title: string
  description: string
  bullets: string[]
  path?: string
  cta?: string
}

const STEPS: OnboardingStep[] = [
  {
    title: 'Witaj w MWPanel',
    description: 'Krótki onboarding pomoże szybko zrozumieć układ aplikacji i sposób pracy.',
    bullets: [
      'Dashboard traktuj jako ekran startowy na początek dnia.',
      'Najważniejsze moduły masz dostępne z lewego menu.',
      'Pomoc kontekstowa jest dostępna z nagłówka i w wybranych widokach.',
    ],
    path: '/',
    cta: 'Otwórz dashboard',
  },
  {
    title: 'Praca na klientach i leadach',
    description: 'Obsługa sprzedaży zaczyna się od poprawnie prowadzonych kontaktów i zapytań.',
    bullets: [
      'Klienci to baza relacji i historii współpracy.',
      'Leady służą do obsługi nowych zapytań i kwalifikacji szans sprzedażowych.',
      'Pipeline pokazuje, na jakim etapie znajdują się aktywne sprawy.',
    ],
    path: '/leads',
    cta: 'Przejdź do leadów',
  },
  {
    title: 'Oferty i publikacja',
    description: 'Ten obszar odpowiada za tworzenie ofert, ich analizę i wysyłkę do portali.',
    bullets: [
      'Nieruchomości to podstawowy moduł do pracy na ofercie.',
      'Publikacja ofert służy do kontroli gotowości eksportu.',
      'Monitoring pomaga obserwować rynek i konkurencję.',
    ],
    path: '/nieruchomosci',
    cta: 'Przejdź do ofert',
  },
  {
    title: 'Dokumenty i formalności',
    description: 'System wspiera także przygotowanie materiałów formalnych dla klienta i nieruchomości.',
    bullets: [
      'Dokumenty porządkują repozytorium plików i szablonów.',
      'Generator dokumentów przygotowuje gotowe dokumenty na bazie danych z CRM.',
      'Pliki pomagają zarządzać załącznikami, zdjęciami i materiałami pomocniczymi.',
    ],
    path: '/dokumenty',
    cta: 'Przejdź do dokumentów',
  },
  {
    title: 'Planowanie i kontrola pracy',
    description: 'Na końcu warto spiąć pracę w harmonogram i raportowanie.',
    bullets: [
      'Zadania porządkują listę działań do wykonania.',
      'Kalendarz pilnuje spotkań, prezentacji i terminów.',
      'Raporty pozwalają ocenić wyniki i efektywność pracy.',
    ],
    path: '/raporty',
    cta: 'Przejdź do raportów',
  },
]

export const ONBOARDING_STORAGE_KEY = 'mwpanel:onboarding-completed'

const OnboardingModal = ({ open, onClose, onComplete }: OnboardingModalProps) => {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const finish = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    }
    onComplete?.()
    onClose()
  }

  if (!open) return null

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">Onboarding</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{current.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Zamknij onboarding"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{current.description}</p>

          <ul className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
            {current.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center gap-2">
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={`h-2.5 rounded-full transition-all ${index === step ? 'w-8 bg-blue-600' : 'w-2.5 bg-gray-300 dark:bg-gray-700'}`}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={isFirst}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                <ArrowLeft size={15} /> Wstecz
              </button>
              <button
                type="button"
                onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
                disabled={isLast}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dalej <ArrowRight size={15} />
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {current.path && current.cta && (
                <Link
                  to={current.path}
                  onClick={finish}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-950/20"
                >
                  <ExternalLink size={15} />
                  {current.cta}
                </Link>
              )}
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
              >
                Zakończ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingModal
