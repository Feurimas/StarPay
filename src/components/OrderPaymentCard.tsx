import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money } from '@/components/commerce'
import { Alert, Badge, Button, Card, CardHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { shortAddress, shortHash, txUrl } from '@/lib/onchain'
import type { PaymentDto } from '@/pages/store/PayPanel'

const TONE = { confirmed: 'success', pending: 'warning', requested: 'neutral' } as const
const LABEL = { confirmed: 'Verified onchain', pending: 'Verifying', requested: 'Awaiting payment' } as const

/** Merchant view of one order's USDC payment. The status shown here is whatever the server verified, never a click. */
export function OrderPaymentCard({ orderId, orderStatus, orderPaid, onChanged }: { orderId: string; orderStatus: string; orderPaid: boolean; onChanged: () => void }) {
  const { workspace, can } = useWorkspace()
  const [payment, setPayment] = useState<PaymentDto | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const base = `/workspaces/${workspace.id}/orders/${orderId}`

  useEffect(() => {
    let cancelled = false
    api.get<{ payment: PaymentDto | null }>(`${base}/payment`).then((r) => !cancelled && setPayment(r.payment)).catch(() => !cancelled && setPayment(null))
    return () => {
      cancelled = true
    }
  }, [base, orderPaid])

  const request = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ payment: PaymentDto }>(`${base}/payment-request`)
      setPayment(r.payment)
      toast.success('Payment request created.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const recheck = async () => {
    if (!payment) return
    setBusy(true)
    try {
      const r = await api.post<{ payment: PaymentDto }>(`/workspaces/${workspace.id}/payments/${payment.id}/refresh`)
      setPayment(r.payment)
      if (r.payment.status === 'confirmed') onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="USDC payment" description="Paid straight to your payout wallet on Arc Testnet." />
      <div className="space-y-3 p-5 sm:p-6">
        {payment === undefined ? (
          <p className="text-sm text-muted">Loading payment...</p>
        ) : payment === null ? (
          orderStatus === 'cancelled' || orderPaid ? (
            <p className="text-sm text-muted">No USDC payment was requested for this order.</p>
          ) : (
            <>
              <p className="text-sm text-muted">No payment has been requested yet. It is created automatically when the customer opens the payment step, or you can create it now.</p>
              {error && <Alert tone="error">{error}{error.includes('payout wallet') && <> <Link className="font-semibold underline" to={`/app/${workspace.id}/wallet`}>Set a payout wallet</Link>.</>}</Alert>}
              {can('payments.manage') && <Button onClick={() => void request()} loading={busy}>Request USDC payment</Button>}
            </>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={TONE[payment.status]}>{LABEL[payment.status]}</Badge>
              <Money value={payment.amount} className="font-semibold" />
            </div>
            <dl className="space-y-1.5 text-xs">
              <div><dt className="text-subtle">Reference</dt><dd className="mono break-all text-ink-2">{payment.invoiceRef}</dd></div>
              <div><dt className="text-subtle">Recipient</dt><dd className="mono">{shortAddress(payment.merchant)}</dd></div>
              {payment.payer && <div><dt className="text-subtle">Paid by</dt><dd className="mono">{shortAddress(payment.payer)}</dd></div>}
            </dl>
            {payment.txs.map((t) => (
              <div key={t.txHash} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs">
                <a href={txUrl(t.txHash)} target="_blank" rel="noopener noreferrer" className="mono inline-flex items-center gap-1 font-semibold text-brand hover:underline">{shortHash(t.txHash)} <ExternalLink className="h-3 w-3" aria-hidden /></a>
                <Badge tone={t.status === 'confirmed' ? 'success' : t.status === 'submitted' ? 'warning' : 'danger'}>{t.status === 'submitted' ? 'verifying' : t.status}</Badge>
                {t.status !== 'confirmed' && <span className="basis-full text-muted">{t.detail}</span>}
              </div>
            ))}
            {payment.status !== 'confirmed' && can('payments.manage') && <Button variant="secondary" size="sm" onClick={() => void recheck()} loading={busy}>Re-check onchain</Button>}
          </>
        )}
      </div>
    </Card>
  )
}
