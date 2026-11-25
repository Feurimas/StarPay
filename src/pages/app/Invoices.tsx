import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money, PaymentBadge } from '@/components/commerce'
import { InvoiceView, type InvoiceData } from '@/components/InvoiceView'
import { Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'

interface InvoiceRow {
  id: string
  number: string
  status: string
  amount: string
  issuedAt: string
  dueAt: string
  orderNumber: string
  customerName: string
  paymentStatus: string
}

export function InvoiceList() {
  const { workspace, prefs } = useWorkspace()
  const [list, setList] = useState<InvoiceRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<{ invoices: InvoiceRow[] }>(`/workspaces/${workspace.id}/invoices`).then((r) => !cancelled && setList(r.invoices)).catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  return (
    <>
      <PageHeader title="Invoices" description="Invoices are issued from an order. Each carries a reference your customer can use to pay in USDC." />
      {!list ? (
        <Spinner label="Loading invoices" />
      ) : list.length === 0 ? (
        <Card><EmptyState icon={<FileText className="h-5 w-5" />} title="No invoices yet" description="Open an order and choose Generate invoice." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((i) => (
              <li key={i.id}>
                <Link to={`/app/${workspace.id}/invoices/${i.id}`} className="flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-muted sm:px-6">
                  <span className="mono w-28 text-sm font-semibold">{i.number}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-[15px] font-semibold">{i.customerName}</p>
                    <p className="text-xs text-muted">Order #{i.orderNumber} · due {formatDate(i.dueAt, prefs)}</p>
                  </div>
                  {i.status === 'void' ? <Badge>Void</Badge> : <PaymentBadge status={i.paymentStatus} />}
                  <Money value={i.amount} className="w-32 text-right text-sm font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

export function InvoiceDetail() {
  const { workspace, prefs } = useWorkspace()
  const { vid } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<InvoiceData | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ invoice: InvoiceData }>(`/workspaces/${workspace.id}/invoices/${vid}`)
      .then((r) => !cancelled && setData(r.invoice))
      .catch((e) => {
        toast.error(errorMessage(e))
        void navigate(`/app/${workspace.id}/invoices`, { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [workspace.id, vid, navigate])

  if (!data) return <Spinner label="Loading invoice" />
  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden"><PageHeader title={data.number} description="Printable invoice for your customer." /></div>
      <InvoiceView invoice={data} prefs={prefs} />
    </div>
  )
}
