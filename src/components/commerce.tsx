import { ImageOff } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui'
import { fmtUsdc } from '@/lib/usdc'

export function ProductImage({ id, alt, className }: { id: string | null | undefined; alt: string; className?: string }) {
  if (!id) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-muted text-subtle', className)} role="img" aria-label={`${alt} (no image)`}>
        <ImageOff className="h-6 w-6" aria-hidden />
      </div>
    )
  }
  return <img src={`/api/images/${id}`} alt={alt} loading="lazy" className={clsx('bg-surface-muted object-cover', className)} />
}

export function Money({ value, className }: { value: string; className?: string }) {
  return <span className={clsx('tabular-nums', className)}>{fmtUsdc(value)}</span>
}

const ORDER_TONE = { pending: 'warning', processing: 'brand', fulfilled: 'success', cancelled: 'neutral' } as const
const ORDER_LABEL = { pending: 'Pending', processing: 'Processing', fulfilled: 'Fulfilled', cancelled: 'Cancelled' } as const

export function OrderStatusBadge({ status }: { status: string }) {
  const key = status as keyof typeof ORDER_TONE
  return <Badge tone={ORDER_TONE[key] ?? 'neutral'}>{ORDER_LABEL[key] ?? status}</Badge>
}

/** Payment state is only ever set by verified onchain payment (Phase 3). Until then it reads Unpaid. */
export function PaymentBadge({ status }: { status: string }) {
  if (status === 'paid') return <Badge tone="success">Paid (verified)</Badge>
  if (status === 'refunded') return <Badge tone="neutral">Refunded</Badge>
  return <Badge tone="warning">Unpaid</Badge>
}

export function ProductStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral'}>{status[0].toUpperCase() + status.slice(1)}</Badge>
}
