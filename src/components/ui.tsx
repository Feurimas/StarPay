import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { clsx } from 'clsx'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-[#2b2a27] active:bg-ink',
  accent: 'bg-accent text-ink hover:bg-[#ff6e36] active:bg-accent',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:bg-[#962036]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'md' | 'sm'
}

export function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.99]',
        size === 'md' ? 'min-h-11 px-5 text-sm' : 'min-h-9 px-3.5 text-[13px]',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

const fieldBase =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-subtle ' +
  'transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--focus)]/40 disabled:bg-surface-muted disabled:text-muted'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(fieldBase, 'min-h-11', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(fieldBase, 'min-h-28 py-2.5', className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(fieldBase, 'min-h-11 pr-8', className)}>
      {children}
    </select>
  )
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</section>
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div>
        <h2 className="display text-lg font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 max-w-xl text-sm text-muted text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'violet'
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-2',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  violet: 'bg-violet-soft text-violet',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle
  const styles = {
    info: 'bg-surface-muted text-ink-2',
    success: 'bg-success-soft text-success',
    error: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm', styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-pretty">{children}</div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <h3 className="display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted text-pretty">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[2rem] font-bold leading-tight text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
