import { Plus, Receipt, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money, OrderStatusBadge, PaymentBadge } from '@/components/commerce'
import { Button, Card, EmptyState, Input, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { clsx } from 'clsx'

export interface OrderSummary {
  id: string
  number: string
  customerName: string
  customerEmail: string
  status: string
  paymentStatus: string
  total: string
  createdAt: string
}

const TABS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'fulfilled', label: 'Fulfilled' },
  { id: 'cancelled', label: 'Cancelled' },
]

export default function Orders() {
  const { workspace, can, prefs } = useWorkspace()
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const base = `/app/${workspace.id}`

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (debounced) params.set('q', debounced)
    api
      .get<{ orders: OrderSummary[] }>(`/workspaces/${workspace.id}/orders?${params}`)
      .then((r) => !cancelled && setOrders(r.orders))
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id, status, debounced])

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from your storefront and manual entry. Payment shows Unpaid until it is verified onchain."
        action={can('orders.manage') && <Link to={`${base}/orders/new`}><Button><Plus className="h-4 w-4" aria-hidden /> New order</Button></Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Order status" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={status === t.id} onClick={() => { setOrders(null); setStatus(t.id) }} className={clsx('min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium', status === t.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label="Search orders" placeholder="Customer, email or order number" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {!orders ? (
        <Spinner label="Loading orders" />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt className="h-5 w-5" />} title="No orders found" description={status || debounced ? 'Try a different filter.' : 'Orders from your storefront appear here as customers check out.'} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`${base}/orders/${o.id}`} className="flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-muted sm:px-6">
                  <span className="mono w-14 text-sm font-semibold text-muted">#{o.number}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-[15px] font-semibold">{o.customerName}</p>
                    <p className="truncate text-xs text-muted">{o.customerEmail} · {formatDate(o.createdAt, prefs)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <PaymentBadge status={o.paymentStatus} />
                  </div>
                  <Money value={o.total} className="w-32 text-right text-sm font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
