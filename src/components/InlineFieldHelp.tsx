import { useState } from 'react'
import { CircleHelp } from 'lucide-react'

type InlineFieldHelpProps = {
  text: string
}

const InlineFieldHelp = ({ text }: InlineFieldHelpProps) => {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
        aria-label="Pomoc do pola"
        title="Pomoc do pola"
      >
        <CircleHelp size={14} />
      </button>

      {open && (
        <span className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          {text}
        </span>
      )}
    </span>
  )
}

export default InlineFieldHelp
