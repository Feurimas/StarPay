import { ArrowUpRight, Globe, Menu, X, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { HillsArt } from '@/components/art'
import { Logo } from '@/components/Logo'
import { LiveChatSupport } from '@/components/LiveChatSupport'
import { clsx } from 'clsx'

const LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Docs' },
  { to: '/contact', label: 'Contact' },
]

const pill = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-all duration-200'

export default function PublicLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col bg-canvas relative">
      {/* Top Banner Announcement */}
      <aside aria-label="Announcement" className="relative z-40 bg-gradient-to-r from-[#ff5a1a] via-[#f59e0b] to-[#ec4899] px-4 py-2 text-center text-xs font-medium text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
          <Sparkles className="h-3.5 w-3.5 animate-spin" />
          <span>StarPay 3D Engine is now live on Arc Testnet with Supabase Postgres & Autonomous AI Support!</span>
          <Link to="/how-it-works" className="underline hover:text-white/80 font-bold ml-1">
            Learn more →
          </Link>
        </div>
      </aside>

      {/* Main Navbar */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border border-orange-500/15 bg-surface/85 pl-5 pr-2 shadow-[0_10px_35px_-15px_rgba(255,90,26,0.25)] backdrop-blur-xl">
          <Link to="/" aria-label="StarPay home" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-surface/50 p-1 md:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  clsx(
                    'rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-sm'
                      : 'text-ink-2 hover:bg-surface-muted hover:text-ink'
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {!user && (
              <Link to="/signin" className="px-3 text-sm font-medium text-ink-2 hover:text-brand transition-colors">
                Sign in
              </Link>
            )}
            <Link
              to={user ? '/app' : '/signup'}
              className={clsx(
                pill,
                'min-h-10 bg-gradient-to-r from-ink to-ink-2 text-white shadow-md hover:shadow-lg hover:scale-105 active:scale-95'
              )}
            >
              {user ? 'Open dashboard' : 'Get started'} <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-muted md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="mx-auto mt-2 max-w-6xl rounded-3xl border border-line bg-surface/95 p-4 shadow-card backdrop-blur-xl md:hidden">
            <nav className="flex flex-col" aria-label="Mobile">
              {LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center border-b border-line text-[15px] font-medium text-ink last:border-0"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 flex gap-3">
              {!user && (
                <Link to="/signin" onClick={() => setOpen(false)} className={clsx(pill, 'flex-1 border border-line text-ink')}>
                  Sign in
                </Link>
              )}
              <Link to={user ? '/app' : '/signup'} onClick={() => setOpen(false)} className={clsx(pill, 'flex-1 bg-gradient-to-r from-orange-600 to-amber-600 text-white')}>
                {user ? 'Dashboard' : 'Get started'}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Floating 24/7 AI Customer Support Widget */}
      <LiveChatSupport />

      {/* Footer */}
      <footer className="relative mt-16 overflow-hidden bg-canvas pb-28 pt-8">
        <HillsArt className="absolute inset-x-0 bottom-0 h-[22rem] w-full opacity-60" />
        <div className="relative mx-auto max-w-6xl px-3 sm:px-6">
          <div className="rounded-3xl border border-line bg-surface/90 p-6 shadow-card backdrop-blur-sm sm:p-8">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <Logo />
                <p className="eyebrow mt-4 !text-accent font-semibold">Autonomous global commerce, verified onchain.</p>
                <p className="mt-3 max-w-sm text-sm text-muted text-pretty">
                  StarPay enables peer-to-peer USDC payments directly to your wallet on Arc Testnet with deterministic finality, catalog management, and automated AI assistance.
                </p>
              </div>
              <div className="text-sm">
                <p className="eyebrow">Product</p>
                <ul className="mt-3 space-y-1">
                  {LINKS.slice(0, 3).map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="inline-flex min-h-9 items-center text-ink-2 hover:text-brand transition-colors">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-sm">
                <p className="eyebrow">Company & Support</p>
                <ul className="mt-3 space-y-1">
                  {[
                    { to: '/docs', label: 'Documentation' },
                    { to: '/contact', label: 'Contact Team' },
                    { to: '/signin', label: 'Merchant Sign in' },
                  ].map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="inline-flex min-h-9 items-center text-ink-2 hover:text-brand transition-colors">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
              <span className="inline-flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent" aria-hidden /> Powered by Arc Testnet & Supabase Cloud
              </span>
              <span className="eyebrow">Contract: 0x47aa0521211cd144a56ba2910a732241efcdd512</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
