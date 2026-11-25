import { Copy, FileText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money, OrderStatusBadge, PaymentBadge } from '@/components/commerce'
import { OrderPaymentCard } from '@/components/OrderPaymentCard'
import { Alert, Button, Card, CardHeader, PageHeader, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { countryName } from '@/lib/countries'
import { formatDate } from '@/lib/format'
import { buildShareLink } from '@/lib/share'

interface OrderDetailData {
  order: {
    id: string; number: string; customerId: string | null; customerName: string; customerEmail: string; status: string
    paymentStatus: string; subtotal: string; discount: string; total: string; discountCode: string | null; notes: string
    shipTo: { addressLine1?: string | null; city?: string | null; postalCode?: string | null; country?: string | null; phone?: string | null }
    createdAt: string; publicId: string
  }
  items: { id: string; name: string; unitPrice: string; quantity: number; lineTotal: string }[]
  events: { id: string; kind: string; detail: string; actor: string | null; at: string }[]
  invoice: { id: string; number: string; status: string } | null
}

const NEXT: Record<string, { to: string; label: string; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  pending: [{ to: 'processing', label: 'Start processing', variant: 'primary' }, { to: 'fulfilled', label: 'Mark fulfilled', variant: 'secondary' }, { to: 'cancelled', label: 'Cancel order', variant: 'danger' }],
  processing: [{ to: 'fulfilled', label: 'Mark fulfilled', variant: 'primary' }, { to: 'cancelled', label: 'Cancel order', variant: 'danger' }],
  fulfilled: [],
  cancelled: [],
}

export default function OrderDetail() {
  const { workspace, can, prefs } = useWorkspace()
  const { oid } = useParams()
  const base = `/workspaces/${workspace.id}/orders/${oid}`
  const [data, setData] = useState<OrderDetailData | null>(null)
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const r = await api.get<OrderDetailData>(base)
    setData(r)
    setNotes(r.order.notes)
  }, [base])

  useEffect(() => {
    let cancelled = false
    api
      .get<OrderDetailData>(base)
      .then((r) => {
        if (cancelled) return
        setData(r)
        setNotes(r.order.notes)
      })
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [base])

  const publicId = data?.order.publicId
  useEffect(() => {
    if (!publicId) return
    let cancelled = false
    void buildShareLink(`/order/${publicId}`).then((l) => !cancelled && setLink(l))
    return () => {
      cancelled = true
    }
  }, [publicId])

  if (!data) return <Spinner label="Loading order" />
  const { order } = data
  const manage = can('orders.manage')

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      await load()
      toast.success(ok)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  const address = [order.shipTo.addressLine1, [order.shipTo.postalCode, order.shipTo.city].filter(Boolean).join(' '), countryName(order.shipTo.country)].filter(Boolean)

  return (
    <>
      <PageHeader
        title={`Order #${order.number}`}
        description={`Placed ${formatDate(order.createdAt, prefs, true)}`}
        action={<div className="flex items-center gap-2"><OrderStatusBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></div>}
      />
      {order.paymentStatus === 'unpaid' && order.status !== 'cancelled' && (
        <div className="mb-6">
          <Alert tone="warning">No payment has been verified for this order. It is marked paid only after the server verifies a USDC payment onchain.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <OrderPaymentCard orderId={order.id} orderStatus={order.status} orderPaid={order.paymentStatus === 'paid'} onChanged={() => void load()} />
          <Card>
            <CardHeader title="Items" />
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.name}</p>
                    <p className="text-xs text-muted"><Money value={i.unitPrice} /> x {i.quantity}</p>
                  </div>
                  <Money value={i.lineTotal} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line px-5 py-4 text-sm sm:px-6">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money value={order.subtotal} /></dd></div>
              {order.discountCode && <div className="flex justify-between"><dt className="text-muted">Discount ({order.discountCode})</dt><dd>-<Money value={order.discount} /></dd></div>}
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd><Money value={order.total} /></dd></div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Internal notes" description="Only your team sees these." />
            <div className="space-y-3 p-5 sm:p-6">
              <Textarea aria-label="Internal notes" maxLength={500} value={notes} disabled={!manage} onChange={(e) => setNotes(e.target.value)} />
              {manage && (
                <Button variant="secondary" size="sm" loading={busy === 'notes'} disabled={notes === order.notes} onClick={() => void run('notes', () => api.patch(`${base}/notes`, { notes }), 'Notes saved.')}>
                  Save notes
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="divide-y divide-line">
              {data.events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <span className="text-pretty">{e.detail}{e.actor && <span className="text-muted"> by {e.actor}</span>}</span>
                  <span className="shrink-0 text-xs text-subtle">{formatDate(e.at, prefs, true)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {manage && NEXT[order.status].length > 0 && (
            <Card>
              <CardHeader title="Update status" />
              <div className="flex flex-col gap-2 p-5 sm:p-6">
                {NEXT[order.status].map((n) => (
                  <Button
                    key={n.to}
                    variant={n.variant}
                    loading={busy === n.to}
                    onClick={() => (n.to !== 'cancelled' || confirm('Cancel this order? Reserved stock is returned.')) && void run(n.to, () => api.patch(`${base}/status`, { status: n.to }), 'Order updated.')}
                  >
                    {n.label}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-1 p-5 text-sm sm:p-6">
              <p className="font-semibold">{order.customerId ? <Link to={`/app/${workspace.id}/customers/${order.customerId}`} className="hover:underline">{order.customerName}</Link> : order.customerName}</p>
              <p className="text-muted">{order.customerEmail}</p>
              {order.shipTo.phone && <p className="text-muted">{order.shipTo.phone}</p>}
              {address.map((l) => <p key={l} className="text-muted">{l}</p>)}
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoice" />
            <div className="space-y-3 p-5 sm:p-6">
              {data.invoice ? (
                <Link to={`/app/${workspace.id}/invoices/${data.invoice.id}`} className="flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
                  <FileText className="h-4 w-4" aria-hidden /> {data.invoice.number} {data.invoice.status === 'void' && '(void)'}
                </Link>
              ) : can('invoices.manage') && order.status !== 'cancelled' ? (
                <Button variant="secondary" loading={busy === 'invoice'} onClick={() => void run('invoice', () => api.post(`${base}/invoice`), 'Invoice issued.')}>
                  Generate invoice
                </Button>
              ) : (
                <p className="text-sm text-muted">No invoice issued.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer order link" description="Lets the customer see this order's status." />
            <div className="flex items-center gap-2 p-5 sm:p-6">
              <code className="mono min-w-0 flex-1 truncate rounded-xl bg-surface-muted px-3 py-2.5 text-xs">{link || 'Preparing link...'}</code>
              <Button variant="secondary" disabled={!link} onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success('Link copied.'), () => toast.error('Could not copy.'))}>
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
