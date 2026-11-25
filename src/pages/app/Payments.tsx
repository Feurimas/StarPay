import { ExternalLink, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money } from '@/components/commerce'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { shortAddress, shortHash, txUrl } from '@/lib/onchain'
import type { PaymentDto } from '@/pages/store/PayPanel'

interface Row extends PaymentDto {
  orderId: string
  orderNumber: string
  customerName: string
  createdAt: string
}

interface Data {
  enabled: boolean
  summary: { verifiedCount: number; verifiedAmount: string; pendingCount: number; pendingAmount: string; awaitingCount: number; awaitingAmount: string }
  payments: Row[]
}

const TONE = { confirmed: 'success', pending: 'warning', requested: 'neutral' } as const
const LABEL = { confirmed: 'Verified onchain', pending: 'Verifying', requested: 'Awaiting payment' } as const

export default function Payments() {
  const { workspace, can, prefs } = useWorkspace()
  const [data, setData] = useState<Data | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<Data>(`/workspaces/${workspace.id}/payments`).then((r) => !cancelled && setData(r)).catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id, tick])

  const recheck = async (id: string) => {
    setBusy(id)
    try {
      await api.post(`/workspaces/${workspace.id}/payments/${id}/refresh`)
      setTick((t) => t + 1)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <Spinner label="Loading payments" />
  const s = data?.summary || { verifiedCount: 0, verifiedAmount: "0.00", pendingCount: 0, pendingAmount: "0.00", awaitingCount: 0, awaitingAmount: "0.00" }

  return (
    <>
      <PageHeader title="Payments" description="USDC payments on Arc Testnet. Totals below count only payments the server verified onchain." action={<Link to={`/app/${workspace.id}/wallet`}><Button variant="secondary"><Wallet className="h-4 w-4" aria-hidden /> Wallet and payouts</Button></Link>} />
      {!data.enabled && <div className="mb-4"><Alert tone="warning">The payment contract is not configured on this server, so customers cannot pay yet.</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm font-medium text-muted">Verified payments</p><p className="display mt-2 text-3xl font-semibold tabular-nums text-success">{s.verifiedCount}</p><p className="mt-1 text-xs text-subtle">Onchain verified: <Money value={s.verifiedAmount} /></p></Card>
        <Card className="p-5"><p className="text-sm font-medium text-muted">Verifying</p><p className="display mt-2 text-3xl font-semibold tabular-nums">{s.pendingCount}</p><p className="mt-1 text-xs text-subtle">Submitted, not yet verified: <Money value={s.pendingAmount} /></p></Card>
        <Card className="p-5"><p className="text-sm font-medium text-muted">Awaiting payment</p><p className="display mt-2 text-3xl font-semibold tabular-nums">{s.awaitingCount}</p><p className="mt-1 text-xs text-subtle">Requested from customers: <Money value={s.awaitingAmount} /></p></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Transaction history" description="Each row is one payment request. Transaction links open the Arc Testnet explorer." />
        {(data.payments || []).length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No payment requests yet" description="A request is created when a customer opens the payment step on their order, or when you request payment from an order." />
        ) : (
          <ul className="divide-y divide-line">
            {(data.payments || []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1 basis-48">
                  <Link to={`/app/${workspace.id}/orders/${p.orderId}`} className="text-[15px] font-semibold hover:underline">Order #{p.orderNumber} · {p.customerName}</Link>
                  <p className="mono mt-0.5 truncate text-xs text-subtle" title={p.invoiceRef}>ref {shortHash(p.invoiceRef)}</p>
                  {p.payer && <p className="text-xs text-muted">Paid by {shortAddress(p.payer)}</p>}
                  <p className="text-xs text-subtle">{formatDate(p.confirmedAt ?? p.createdAt, prefs, true)}</p>
                </div>
                <Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge>
                <Money value={p.amount} className="w-32 text-right text-sm font-semibold" />
                <div className="flex items-center gap-2">
                  {p.txHash && <a href={txUrl(p.txHash)} target="_blank" rel="noopener noreferrer" className="mono inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">{shortHash(p.txHash)} <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                  {p.status !== 'confirmed' && can('payments.manage') && (
                    <Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => void recheck(p.id)} aria-label={`Re-check payment for order ${p.orderNumber}`}><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Re-check</Button>
                  )}
                </div>
                {p.txs.filter((t) => t.status === 'reverted' || t.status === 'rejected').slice(0, 2).map((t) => (
                  <p key={t.txHash} className="basis-full text-xs text-danger">Failed attempt <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer" className="mono underline">{shortHash(t.txHash)}</a>: {t.detail}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
