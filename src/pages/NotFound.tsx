import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-sm font-semibold text-brand">Error 404</p>
      <h1 className="display mt-2 text-3xl font-semibold text-ink">We could not find that page</h1>
      <p className="mt-2 text-sm text-muted">The link may be mistyped or the page may have moved.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">Home</Link>
        <Link to="/app" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-ink">Your workspace</Link>
      </div>
    </div>
  )
}
