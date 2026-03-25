import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleHelp, ExternalLink } from 'lucide-react'
import type { ContextHelpEntry } from './helpContent'

type ContextHelpButtonProps = {
  help: ContextHelpEntry | null
}

const ContextHelpButton = ({ help }: ContextHelpButtonProps) => {
  const [open, setOpen] = useState(false)

  if (!help) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-950/40"
        aria-label="Pokaż pomoc kontekstową"
        title="Pomoc kontekstowa"
      >
        <CircleHelp size={16} />
        Pomoc do tego widoku
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{help.title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{help.intro}</p>
          </div>

          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {help.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {help.quickActions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Szybkie przejścia</p>
              <div className="space-y-2">
                {help.quickActions.map((action) => (
                  <Link
                    key={action.title}
                    to={action.path}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                      <ExternalLink size={14} />
                      {action.title}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{action.description}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {help.faqs.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">FAQ dla tego widoku</p>
              <div className="space-y-2">
                {help.faqs.map((faq) => (
                  <div key={faq.question} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{faq.question}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ContextHelpButton
