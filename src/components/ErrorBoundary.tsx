import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Catches render errors so a bug in one screen shows a recovery message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error.message, info.componentStack?.split('\n').slice(0, 3).join(' '))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md px-4 text-center">
        <h1 className="display text-2xl font-semibold text-ink">This screen hit a problem</h1>
        <p className="mt-2 text-sm text-muted">Your data is safe. Reload the page to try again. If it keeps happening, go back to your dashboard.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reload</button>
          <a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-ink" href="/app">Go to dashboard</a>
        </div>
      </div>
    )
  }
}
