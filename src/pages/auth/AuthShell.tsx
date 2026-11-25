import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { HillsArt } from '@/components/art'
import { Logo } from '@/components/Logo'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas">
      <HillsArt className="pointer-events-none absolute inset-x-0 bottom-0 h-72 w-full opacity-90" />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="StarPay home">
          <Logo />
        </Link>
        <Link to="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to site
        </Link>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-40 pt-4 sm:items-center">
        <div className="w-full max-w-[27rem]">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <p className="eyebrow">StarPay workspace</p>
            <h1 className="hero-title mt-2 text-[2.2rem] text-balance">{title}</h1>
            {subtitle && <p className="serif mt-2 text-[17px] leading-snug text-ink-2 text-pretty">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 rounded-full bg-surface/90 px-4 py-2 text-center text-sm text-ink-2 backdrop-blur">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
