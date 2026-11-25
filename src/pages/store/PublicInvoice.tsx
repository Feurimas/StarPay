import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LogoMark } from '@/components/Logo'
import { InvoiceView, type InvoiceData } from '@/components/InvoiceView'
import { EmptyState, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { PublicFrame } from './OrderStatus'

export default function PublicInvoice() {
  const { pubid } = useParams()
  const [data, setData] = useState<InvoiceData | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ invoice: InvoiceData }>(`/public/invoices/${pubid}`)
      .then((r) => !cancelled && setData(r.invoice))
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [pubid])

  if (missing) return <PublicFrame><EmptyState icon={<LogoMark className="h-6 w-6" />} title="Invoice not found" description="Check the link you were given." /></PublicFrame>
  if (!data) return <PublicFrame><Spinner label="Loading invoice" /></PublicFrame>
  return (
    <PublicFrame>
      <InvoiceView invoice={data} prefs={{ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, dateFormat: 'auto', numberFormat: 'auto' }} />
    </PublicFrame>
  )
}
