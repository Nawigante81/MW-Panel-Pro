import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Compass, ExternalLink, Search, X } from 'lucide-react'
import { FAQ_ITEMS, HELP_SECTIONS, QUICK_ACTIONS, STEP_BY_STEP_GUIDES, getContextHelp } from './helpContent'
import OnboardingModal, { ONBOARDING_STORAGE_KEY } from './OnboardingModal'

type HelpProps = {
  open: boolean
  onClose: () => void
}

const Help = ({ open, onClose }: HelpProps) => {
  const [query, setQuery] = useState('')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const completed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!completed) {
      setOnboardingOpen(true)
    }
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()
  const contextHelp = getContextHelp(location.pathname)

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return HELP_SECTIONS

    return HELP_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const haystack = [item.name, item.description, item.businessUse, section.title, section.description]
            .join(' ')
            .toLowerCase()
          return haystack.includes(normalizedQuery)
        }),
      }))
      .filter((section) => section.items.length > 0)
  }, [normalizedQuery])

  const filteredQuickActions = useMemo(() => {
    if (!normalizedQuery) return QUICK_ACTIONS
    return QUICK_ACTIONS.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  const filteredGuides = useMemo(() => {
    if (!normalizedQuery) return STEP_BY_STEP_GUIDES
    return STEP_BY_STEP_GUIDES.filter((guide) => `${guide.title} ${guide.steps.join(' ')}`.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  const filteredFaqs = useMemo(() => {
    if (!normalizedQuery) return FAQ_ITEMS
    return FAQ_ITEMS.filter((faq) => `${faq.question} ${faq.answer}`.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <OnboardingModal open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
      <div
        className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Pomoc</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Instruktażowy opis modułów MWPanel wraz z szybkim przejściem do odpowiednich sekcji aplikacji.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Zamknij pomoc"
            title="Zamknij pomoc"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-82px)] overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            {contextHelp && (
              <section className="rounded-2xl border border-violet-200 bg-violet-50/80 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100">{contextHelp.title}</h3>
                  <p className="mt-1 text-sm text-violet-800 dark:text-violet-200">{contextHelp.intro}</p>
                </div>

                <ul className="space-y-2 text-sm text-violet-900 dark:text-violet-100">
                  {contextHelp.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-violet-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                {contextHelp.quickActions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contextHelp.quickActions.map((action) => (
                      <Link
                        key={action.title}
                        to={action.path}
                        onClick={onClose}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                      >
                        <ExternalLink size={15} />
                        {action.title}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  Wybierz moduł, przeczytaj do czego służy, a następnie użyj przycisku <strong>Przejdź do modułu</strong>, aby od razu otworzyć właściwy ekran.
                </div>
                <button
                  type="button"
                  onClick={() => setOnboardingOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  <Compass size={15} />
                  Uruchom onboarding
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Wyszukaj moduł, funkcję, FAQ lub instrukcję</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Np. publikacja, dokument, lead, nieruchomość..."
                  className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
              </div>
            </div>

            {filteredQuickActions.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-800/70">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Najczęściej wykonywane akcje</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Skróty do najpopularniejszych działań wykonywanych w aplikacji.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredQuickActions.map((action) => (
                    <article key={action.title} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{action.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{action.description}</p>
                      <div className="mt-4">
                        <Link to={action.path} onClick={onClose} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
                          <ExternalLink size={15} />
                          Przejdź do modułu
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {filteredGuides.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-800/70">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Instrukcje krok po kroku</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Szybkie instrukcje dla najczęstszych procesów wykonywanych w systemie.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {filteredGuides.map((guide) => (
                    <article key={guide.title} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{guide.title}</h4>
                      <ol className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                        {guide.steps.map((step, index) => (
                          <li key={step} className="flex gap-3">
                            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{index + 1}</span>
                            <span className="leading-6">{step}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-4">
                        <Link to={guide.path} onClick={onClose} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-950/30">
                          <ExternalLink size={15} />
                          Otwórz właściwy moduł
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {filteredFaqs.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-800/70">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">FAQ</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Najczęściej zadawane pytania o pracę w systemie.</p>
                </div>
                <div className="space-y-3">
                  {filteredFaqs.map((faq) => (
                    <article key={faq.question} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{faq.question}</h4>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{faq.answer}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {filteredSections.length > 0 ? (
              filteredSections.map((section) => (
                <section key={section.title} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-800/70">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{section.title}</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{section.description}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <article key={item.name} className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
                          <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              <Icon size={18} />
                            </div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">{item.name}</h4>
                          </div>
                          <div className="space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                            <p>{item.description}</p>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] leading-5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
                              <strong>Zastosowanie w pracy:</strong> {item.businessUse}
                            </div>
                          </div>
                          <div className="mt-4 pt-3">
                            <Link to={item.path} onClick={onClose} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
                              <ExternalLink size={15} />
                              Przejdź do modułu
                            </Link>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                Brak wyników dla podanej frazy. Spróbuj wpisać nazwę modułu, np. <strong>leady</strong>, <strong>dokumenty</strong> albo <strong>publikacja</strong>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Help
