import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money, OrderStatusBadge, PaymentBadge } from '@/components/commerce'
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import { formatDate } from '@/lib/format'
import type { OrderSummary } from './Orders'

interface CustomerFull {
  id: string; name: string; email: string; phone: string | null; country: string | null; addressLine1: string | null
  addressLine2: string | null; city: string | null; region: string | null; postalCode: string | null; notes: string
  orderCount: number; totalOrdered: string
}

export default function CustomerDetail() {
  const { workspace, can, role, prefs } = useWorkspace()
  const { cid } = useParams()
  const navigate = useNavigate()
  const base = `/workspaces/${workspace.id}/customers/${cid}`
  const [data, setData] = useState<{ customer: CustomerFull; orders: OrderSummary[] } | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const manage = can('customers.manage')

  useEffect(() => {
    let cancelled = false
    api
      .get<{ customer: CustomerFull; orders: OrderSummary[] }>(base)
      .then((r) => {
        if (cancelled) return
        const c = r.customer
        setData(r)
        setForm({ name: c.name, email: c.email, phone: c.phone ?? '', country: c.country ?? '', addressLine1: c.addressLine1 ?? '', addressLine2: c.addressLine2 ?? '', city: c.city ?? '', region: c.region ?? '', postalCode: c.postalCode ?? '', notes: c.notes })
      })
      .catch((e) => {
        toast.error(errorMessage(e))
        void navigate(`/app/${workspace.id}/customers`, { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [base, navigate, workspace.id])

  if (!data) return <Spinner label="Loading customer" />
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.put(base, form)
      toast.success('Customer saved.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this customer? Their past orders stay in your records.')) return
    try {
      await api.delete(base)
      toast.success('Customer deleted.')
      void navigate(`/app/${workspace.id}/customers`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader title={data.customer.name} description={`${data.customer.orderCount} order${data.customer.orderCount === 1 ? '' : 's'} totalling ${data.customer.totalOrdered} USDC (excluding cancelled)`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <form onSubmit={(e) => void save(e)}>
          <Card>
            <CardHeader title="Profile" />
            <fieldset disabled={!manage || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
              <Field label="Name" htmlFor="cd-name"><Input id="cd-name" required minLength={2} value={form.name} onChange={set('name')} /></Field>
              <Field label="Email" htmlFor="cd-email"><Input id="cd-email" type="email" required value={form.email} onChange={set('email')} /></Field>
              <Field label="Phone" htmlFor="cd-phone"><Input id="cd-phone" type="tel" value={form.phone} onChange={set('phone')} /></Field>
              <Field label="Country" htmlFor="cd-country">
                <Select id="cd-country" value={form.country} onChange={set('country')}>
                  <option value="">Not set</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-2"><Field label="Address" htmlFor="cd-a1"><Input id="cd-a1" value={form.addressLine1} onChange={set('addressLine1')} /></Field></div>
              <Field label="City" htmlFor="cd-city"><Input id="cd-city" value={form.city} onChange={set('city')} /></Field>
              <Field label="Postal code" htmlFor="cd-postal"><Input id="cd-postal" value={form.postalCode} onChange={set('postalCode')} /></Field>
              <div className="sm:col-span-2"><Field label="Internal notes" htmlFor="cd-notes"><Textarea id="cd-notes" maxLength={2000} value={form.notes} onChange={set('notes')} /></Field></div>
              {manage && (
                <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                  {role !== 'support' ? <Button type="button" variant="ghost" onClick={() => void remove()}>Delete customer</Button> : <span />}
                  <Button type="submit" loading={busy}>Save customer</Button>
                </div>
              )}
            </fieldset>
          </Card>
        </form>
        <Card className="self-start">
          <CardHeader title="Orders" />
          {data.orders.length === 0 ? (
            <p className="p-5 text-sm text-muted sm:p-6">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.orders.map((o) => (
                <li key={o.id}>
                  <Link to={`/app/${workspace.id}/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted sm:px-6">
                    <div>
                      <p className="mono text-sm font-semibold">#{o.number}</p>
                      <p className="text-xs text-muted">{formatDate(o.createdAt, prefs)}</p>
                    </div>
                    <div className="flex items-center gap-2"><OrderStatusBadge status={o.status} /><PaymentBadge status={o.paymentStatus} /></div>
                    <Money value={o.total} className="text-sm font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
