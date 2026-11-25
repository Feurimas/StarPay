import { Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Money, PaymentBadge } from '@/components/commerce'
import { Badge, Button } from '@/components/ui'
import { countryName } from '@/lib/countries'
import { formatDate, type RegionalPrefs } from '@/lib/format'

export interface InvoiceData {
  number: string
  status: string
  amount: string
  issuedAt: string
  dueAt: string
  paymentStatus: string
  orderNumber: string
  orderPublicId: string
  paymentReference: string | null
  subtotal: string
  discount: string
  total: string
  discountCode: string | null
  items: { name: string; unitPrice: string; quantity: number; lineTotal: string }[]
  customer: { name: string; email: string; shipTo: { addressLine1?: string | null; city?: string | null; postalCode?: string | null; country?: string | null } | null }
  business: { name: string; tradingName: string; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string; supportEmail: string | null; phone: string | null }
}

export function InvoiceView({ invoice, prefs }: { invoice: InvoiceData; prefs: RegionalPrefs }) {
  const b = invoice.business
  const ship = invoice.customer.shipTo
  const bizAddress = [b.addressLine1, b.addressLine2, [b.postalCode, b.city].filter(Boolean).join(' '), b.region, countryName(b.country)].filter(Boolean)
  const custAddress = [ship?.addressLine1, [ship?.postalCode, ship?.city].filter(Boolean).join(' '), countryName(ship?.country)].filter(Boolean)
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card print:border-0 print:p-0 print:shadow-none sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="display text-2xl font-semibold">{b.name}</p>
          {bizAddress.map((l) => (
            <p key={l} className="text-sm text-muted">{l}</p>
          ))}
          {b.supportEmail && <p className="text-sm text-muted">{b.supportEmail}</p>}
          {b.phone && <p className="text-sm text-muted">{b.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">Invoice</p>
          <p className="mono text-xl font-semibold">{invoice.number}</p>
          <p className="mt-1 text-sm text-muted">Order #{invoice.orderNumber}</p>
          <div className="mt-2 flex justify-end gap-2">
            {invoice.status === 'void' ? <Badge tone="neutral">Void</Badge> : <PaymentBadge status={invoice.paymentStatus} />}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">Billed to</p>
          <p className="mt-1 font-semibold">{invoice.customer.name}</p>
          <p className="text-sm text-muted">{invoice.customer.email}</p>
          {custAddress.map((l) => (
            <p key={l} className="text-sm text-muted">{l}</p>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-sm sm:justify-self-end">
          <dt className="text-muted">Issued</dt>
          <dd className="text-right">{formatDate(invoice.issuedAt, prefs)}</dd>
          <dt className="text-muted">Due</dt>
          <dd className="text-right">{formatDate(invoice.dueAt, prefs)}</dd>
          <dt className="text-muted">Currency</dt>
          <dd className="text-right">USDC (Arc Testnet)</dd>
          {invoice.paymentReference && (
            <>
              <dt className="text-muted">Payment reference</dt>
              <dd className="mono max-w-[16rem] break-all text-right text-xs">{invoice.paymentReference}</dd>
            </>
          )}
        </dl>
      </div>
      {invoice.status !== 'void' && invoice.paymentStatus === 'unpaid' && (
        <p className="mt-6 text-sm print:hidden">
          <Link to={`/order/${invoice.orderPublicId}`} className="font-semibold text-brand hover:underline">Pay this invoice in USDC</Link>
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-subtle">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Unit price</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((i) => (
              <tr key={i.name} className="border-b border-line">
                <td className="py-3 font-medium">{i.name}</td>
                <td className="py-3 text-right"><Money value={i.unitPrice} /></td>
                <td className="py-3 text-right tabular-nums">{i.quantity}</td>
                <td className="py-3 text-right"><Money value={i.lineTotal} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto mt-6 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money value={invoice.subtotal} /></dd></div>
        {invoice.discountCode && <div className="flex justify-between"><dt className="text-muted">Discount ({invoice.discountCode})</dt><dd>-<Money value={invoice.discount} /></dd></div>}
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total due</dt><dd><Money value={invoice.total} /></dd></div>
      </dl>

      <p className="mt-8 text-xs text-subtle text-pretty">
        Amounts are denominated in USDC. A payment is recorded as received only after it is verified onchain.
      </p>
      <div className="mt-6 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print or save as PDF
        </Button>
      </div>
    </div>
  )
}
