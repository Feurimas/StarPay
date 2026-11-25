import { clsx } from 'clsx'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('h-8 w-8', className)} aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#0e0e0e" />
      <path d="M16 5.5c.9 5.4 2.6 8.7 10.5 10.5-7.9 1.8-9.6 5.1-10.5 10.5-.9-5.4-2.6-8.7-10.5-10.5C13.4 14.2 15.1 10.900 16 5.5z" fill="#ff5a1a" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="display text-[1.15rem] font-extrabold uppercase tracking-[-0.02em] text-ink">StarPay</span>
    </span>
  )
}
