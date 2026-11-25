import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LogoMark } from '@/components/Logo'
import { Money, OrderStatusBadge, PaymentBadge } from '@/components/commerce'
import { Alert, EmptyState, Spinner } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { PayPanel } from '@/pages/store/PayPanel'

export interface PublicOrder {
  number: string
  status: string
  paymentStatus: string
  customerName: string
  subtotal: string
  discount: string
  total: string
  discountCode: string | null
  createdAt: string
  invoiceId: string | null
  items: { name: string; unitPrice: string; quantity: number; lineTotal: string }[]
}

export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4"><LogoMark className="h-7 w-7" /><span className="display font-semibold">StarPay</span></div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-subtle">Payments in USDC on Arc Testnet. Test funds only.</footer>
    </div>
  )
}

export default function OrderStatus() {
  const { oid } = useParams()
  const [data, setData] = useState<{ order: PublicOrder; store: { slug: string; title: string; published: boolean } | null } | null>(null)
  const [missing, setMissing] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ order: PublicOrder; store: { slug: string; title: string; published: boolean } | null }>(`/public/orders/${oid}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && e instanceof ApiError && e.status === 404 && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [oid, tick])

  if (missing) return <PublicFrame><EmptyState icon={<LogoMark className="h-6 w-6" />} title="Order not found" description="Check the link you were given." /></PublicFrame>
  if (!data) return <PublicFrame><Spinner label="Loading order" /></PublicFrame>
  const { order, store } = data

  return (
    <PublicFrame>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-semibold">Order #{order.number}</h1>
          <p className="mt-1 text-sm text-muted">{store?.title} · placed {formatDate(order.createdAt, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, dateFormat: 'auto', numberFormat: 'auto' }, true)}</p>
        </div>
        <div className="flex items-center gap-2"><OrderStatusBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></div>
      </div>

      <div className="space-y-6">
        {order.status === 'cancelled' ? (
          <Alert tone="warning">This order was cancelled.</Alert>
        ) : (
          <PayPanel orderPublicId={oid ?? ''} paymentStatus={order.paymentStatus} onChanged={() => setTick((t) => t + 1)} />
        )}

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <h2 className="display text-lg font-semibold">Items</h2>
          <ul className="mt-3 divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.name} className="flex justify-between gap-3 py-3 text-sm"><span>{i.name} <span className="text-muted">x {i.quantity}</span></span><Money value={i.lineTotal} /></li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money value={order.subtotal} /></dd></div>
            {order.discountCode && <div className="flex justify-between"><dt className="text-muted">Discount ({order.discountCode})</dt><dd>-<Money value={order.discount} /></dd></div>}
            <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd><Money value={order.total} /></dd></div>
          </dl>
          {order.invoiceId && <Link to={`/i/${order.invoiceId}`} className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">View invoice</Link>}
        </section>
        {store?.published && <Link to={`/s/${store.slug}`} className="inline-block text-sm font-medium text-brand hover:underline">Back to {store.title}</Link>}
      </div>
    </PublicFrame>
  )
}
