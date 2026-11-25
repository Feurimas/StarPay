import { ArrowDownRight, ArrowUpRight, BarChart3, Download, ExternalLink, Printer, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { AiLabel } from '@/components/ai'
import { BarList, Donut, Legend, SOURCE_KEYS, SourceBadge, sourceHint, TrendChart, type Source } from '@/components/charts'
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtUsdc } from '@/lib/usdc'
import { shortAddress, shortHash } from '@/lib/onchain'
import { useApi } from '@/lib/useApi'

interface Metric { value: number | string | null; count?: number; change?: number | null; source: Source }
interface InsightsData {
  days: number
  generatedAt: string
  metrics: Record<'orders' | 'sales' | 'openOrders' | 'completedOrders' | 'cancelledOrders' | 'verifiedPayments' | 'pendingPayments' | 'awaitingPayment' | 'verifiedShare' | 'projectedMonthlySales', Metric>
  series: { day: string; orders: number; sales: string; verified: string; newCustomers: number }[]
  products: { name: string; units: string; revenue: string }[]
  lowStock: { id: string; name: string; stock: number }[]
  customers: { total: number; active: number; returning: number; top: { id: string; name: string; orders: number; value: string }[] }
  recentPayments: { orderNumber: string; amount: string; txHash: string; payer: string | null; confirmedAt: string; explorerUrl: string }[]
}

const PERIODS = [7, 30, 90]

function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted">No earlier period to compare</span>
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-success' : 'text-danger'}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(value)}% <span className="font-normal text-muted">vs previous period</span>
    </span>
  )
}

function Kpi({ label, value, metric, note, tone }: { label: string; value: string; metric: { source: Source; change?: number | null }; note?: string; tone?: 'success' }) {
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <SourceBadge source={metric.source} />
      </div>
      <p className={`display text-3xl font-bold tabular-nums ${tone === 'success' ? 'text-success' : 'text-ink'}`}>{value}</p>
      {metric.change !== undefined ? <Change value={metric.change} /> : note ? <p className="text-xs text-muted">{note}</p> : null}
    </Card>
  )
}

export default function Insights() {
  const { workspace } = useWorkspace()
  const base = `/workspaces/${workspace.id}`
  const [days, setDays] = useState(30)
  const { data, error } = useApi<InsightsData>(`${base}/insights?days=${days}`)
  const [summary, setSummary] = useState<{ narrative: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const summarize = async () => {
    setBusy(true)
    setSummaryError('')
    try {
      setSummary(await api.post(`${base}/assistant/report`, { days }))
    } catch (e) {
      setSummaryError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Spinner label="Loading insights" />
  const m = data.metrics
  const labels = data.series.map((s) => s.day)
  const money = (n: number) => `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n)} USDC`
  const noOrders = m.orders.value === 0 && data.metrics.verifiedPayments.count === 0
  const generated = new Date(data.generatedAt).toLocaleString()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Sales, payments and customer activity for this workspace."
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div role="group" aria-label="Period" className="inline-flex rounded-full border border-line bg-surface p-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDays(p)}
                  aria-pressed={days === p}
                  className={`min-h-9 rounded-full px-3.5 text-sm font-semibold ${days === p ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
                >
                  {p} days
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print report</Button>
          </div>
        }
      />

      <div className="hidden print:block">
        <p className="eyebrow">StarPay business report</p>
        <p className="text-sm">{workspace.name} · last {data.days} days · generated {generated} · days are UTC · Arc Testnet</p>
      </div>

      <Card className="p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold">How to read these numbers</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCE_KEYS.map((s) => (
            <li key={s} className="flex flex-col items-start gap-1">
              <SourceBadge source={s} />
              <span className="text-xs text-muted">{sourceHint(s)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {noOrders && (
        <Card>
          <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="No sales in this period yet" description="Figures appear here as soon as customers place orders and payments are verified. Nothing on this page is sample data." />
        </Card>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total orders" value={String(m.orders.value)} metric={m.orders} />
        <Kpi label="Total sales" value={fmtUsdc(String(m.sales.value))} metric={m.sales} />
        <Kpi label="Verified USDC payments" value={fmtUsdc(String(m.verifiedPayments.value))} metric={{ source: 'onchain' }} note={`${m.verifiedPayments.count} payment${m.verifiedPayments.count === 1 ? '' : 's'}`} tone="success" />
        <Kpi label="Awaiting payment" value={fmtUsdc(String(m.awaitingPayment.value))} metric={m.awaitingPayment} note={`${m.awaitingPayment.count} unpaid order${m.awaitingPayment.count === 1 ? '' : 's'}`} />
        <Kpi label="Pending orders" value={String(m.openOrders.value)} metric={m.openOrders} note="Placed or in progress" />
        <Kpi label="Completed orders" value={String(m.completedOrders.value)} metric={m.completedOrders} note={`${m.cancelledOrders.value} cancelled`} />
        <Kpi label="Pending payments" value={String(m.pendingPayments.count)} metric={m.pendingPayments} note={`${fmtUsdc(String(m.pendingPayments.value))} being verified`} />
        <Kpi
          label="Projected 30-day sales"
          value={m.projectedMonthlySales.value === null ? '' : fmtUsdc(String(m.projectedMonthlySales.value))}
          metric={m.projectedMonthlySales}
          note={`Average daily sales of the last ${data.days} days times 30`}
        />
      </section>
      {m.verifiedShare.value !== null && (
        <p className="text-sm text-muted">
          <SourceBadge source="mixed" /> <span className="ml-1">{m.verifiedShare.value}% of this period's order value has been verified onchain.</span>
        </p>
      )}

      <Card>
        <CardHeader title="Sales trend" description="Order value from your records next to payments the server verified onchain." action={<Legend items={[{ label: 'Order sales (offchain)', color: 'var(--ink)' }, { label: 'Verified payments (onchain)', color: 'var(--success)', dashed: true }]} />} />
        <div className="p-4 sm:p-5">
          <TrendChart
            days={labels}
            label="Daily order sales and verified payments in USDC"
            format={money}
            series={[
              { key: 'sales', label: 'Order sales', values: data.series.map((s) => Number(s.sales)), color: 'var(--ink)' },
              { key: 'verified', label: 'Verified payments', values: data.series.map((s) => Number(s.verified)), color: 'var(--success)', dashed: true },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Orders per day" action={<SourceBadge source="offchain" />} />
          <div className="p-4 sm:p-5">
            <TrendChart days={labels} kind="bar" label="Orders per day" format={(n) => `${n} order${n === 1 ? '' : 's'}`} height={200} series={[{ key: 'orders', label: 'Orders', values: data.series.map((s) => s.orders), color: 'var(--accent)' }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Order status" action={<SourceBadge source="offchain" />} />
          <div className="p-4 sm:p-6">
            <Donut
              centerLabel="orders"
              slices={[
                { label: 'Pending or in progress', value: Number(m.openOrders.value), color: 'var(--accent)' },
                { label: 'Completed', value: Number(m.completedOrders.value), color: 'var(--success)' },
                { label: 'Cancelled', value: Number(m.cancelledOrders.value), color: 'var(--subtle)' },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Product performance" description="By order value, cancelled orders excluded." action={<SourceBadge source="offchain" />} />
          <div className="p-4 sm:p-5">
            {data.products.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No product sales in this period.</p>
            ) : (
              <BarList rows={data.products.map((p) => ({ label: p.name, value: Number(p.revenue), text: fmtUsdc(p.revenue), note: `${p.units} sold` }))} />
            )}
            {data.lowStock.length > 0 && (
              <div className="mt-5 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                <p className="font-semibold">Running low</p>
                <ul className="mt-1 list-inside list-disc">
                  {data.lowStock.map((p) => <li key={p.id}>{p.name}: {p.stock} left</li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Customer activity" action={<SourceBadge source="offchain" />} />
          <div className="space-y-5 p-4 sm:p-5">
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[['Customers', data.customers.total], ['Ordered', data.customers.active], ['Returning', data.customers.returning]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-muted p-3"><dd className="display text-2xl font-bold tabular-nums">{v}</dd><dt className="text-xs text-muted">{k}</dt></div>
              ))}
            </dl>
            <div>
              <p className="mb-2 text-sm font-semibold">New customers per day</p>
              <TrendChart days={labels} kind="bar" label="New customers per day" format={(n) => `${n} new`} height={120} series={[{ key: 'new', label: 'New customers', values: data.series.map((s) => s.newCustomers), color: 'var(--ink)' }]} />
            </div>
            {data.customers.top.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Top customers by order value</p>
                <ul className="divide-y divide-line text-sm">
                  {data.customers.top.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate">{c.name} <span className="text-muted">· {c.orders} order{c.orders === 1 ? '' : 's'}</span></span><span className="font-semibold tabular-nums">{fmtUsdc(c.value)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Verified payments" description="Each payment below was confirmed on Arc Testnet by the server." action={<SourceBadge source="onchain" />} />
        {data.recentPayments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No verified payments yet. Orders stay unpaid until the server verifies the transaction.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="px-5 py-2 font-medium">Order</th><th className="px-3 py-2 font-medium">Amount</th><th className="px-3 py-2 font-medium">Payer</th><th className="px-3 py-2 font-medium">Verified</th><th className="px-5 py-2 font-medium">Transaction</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.recentPayments.map((p) => (
                  <tr key={p.txHash}>
                    <td className="px-5 py-3 font-semibold">#{p.orderNumber}</td>
                    <td className="px-3 py-3 tabular-nums">{fmtUsdc(p.amount)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{p.payer ? shortAddress(p.payer) : ''}</td>
                    <td className="px-3 py-3 text-muted">{new Date(p.confirmedAt).toLocaleString()}</td>
                    <td className="px-5 py-3"><a href={p.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-brand hover:underline">{shortHash(p.txHash)}<ExternalLink className="h-3 w-3" aria-hidden /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="print:hidden">
        <CardHeader title="Business reports" description="Download the records behind these figures, or ask the AI assistant to summarize them." />
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {[['orders', 'Orders'], ['payments', 'Payments'], ['products', 'Products']].map(([kind, label]) => (
              <a key={kind} href={`/api${base}/reports/${kind}?days=${days}`} download className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">
                <Download className="h-4 w-4" aria-hidden /> {label} (CSV)
              </a>
            ))}
          </div>
          <p className="text-xs text-muted">CSV files cover the last {days} days. Orders include customer names and emails, so share them carefully.</p>
          <div>
            <Button onClick={() => void summarize()} loading={busy}><Sparkles className="h-4 w-4" aria-hidden /> Summarize with AI</Button>
            {summaryError && <div className="mt-3"><Alert tone="error">{summaryError}</Alert></div>}
            {summary &&
              (summary.narrative ? (
                <div className="mt-4 rounded-xl bg-canvas p-4"><div className="mb-2"><AiLabel /></div><p className="whitespace-pre-line text-sm">{summary.narrative}</p></div>
              ) : (
                <div className="mt-4"><Alert tone="info">The written summary needs an AI provider. Add AI_API_KEY and AI_MODEL to connect one. The figures above are real either way.</Alert></div>
              ))}
          </div>
        </div>
      </Card>
      <p className="text-xs text-muted print:text-[10px]">Days are UTC calendar days. Arc Testnet and test funds only. Offchain figures are business records, not proof of payment.</p>
    </div>
  )
}
