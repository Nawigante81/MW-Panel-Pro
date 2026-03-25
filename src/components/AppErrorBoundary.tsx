import React from 'react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
}

class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) {
      // Dev-only diagnostics
      console.error('[AppErrorBoundary]', error)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-6">
          <div className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
            <h1 className="text-lg font-semibold mb-2">Ups, coś poszło nie tak</h1>
            <p className="text-sm text-slate-400">Odśwież stronę. Jeśli błąd się powtarza, skontaktuj się z administratorem MWPanel.</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
