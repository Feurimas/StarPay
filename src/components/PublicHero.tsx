import type { ReactNode } from 'react'

/** Page opener for the marketing pages: mono eyebrow, heavy tight headline, serif lead. */
export function PublicHero({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead?: string; children?: ReactNode }) {
  return (
    <header className="mb-10 border-b border-line pb-8">
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-3 grid items-end gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <h1 className="hero-title text-[2.8rem] text-balance sm:text-6xl">{title}</h1>
        {lead && <p className="serif max-w-md text-[18px] leading-snug text-ink-2 text-pretty lg:justify-self-end">{lead}</p>}
      </div>
      {children}
    </header>
  )
}
