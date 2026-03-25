import { useEffect, useState } from 'react'

type ClockState = {
  time: string
  date: string
}

const TZ = 'Europe/Warsaw'

const getClockState = (): ClockState => {
  const now = new Date()
  return {
    time: now.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: TZ,
    }),
    date: now.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: TZ,
    }),
  }
}

export default function AppClock() {
  const [clock, setClock] = useState<ClockState>(() => getClockState())

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(getClockState())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="tabular-nums text-sm md:text-base font-semibold tracking-wide text-[var(--text-main)] leading-none">
      {clock.time}
    </div>
  )
}
