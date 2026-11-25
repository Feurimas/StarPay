import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money } from '@/components/commerce'
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import type { ProductSummary } from './Products'

export default function OrderNew() {
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [pick, setPick] = useState('')
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', country: workspace.country, addressLine1: '', city: '', region: '', postalCode: '' })
  const [discountCode, setDiscountCode] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<{ products: ProductSummary[] }>(`/workspaces/${workspace.id}/products?status=active`).then((r) => !cancelled && setProducts(r.products)).catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products])
  const estimate = useMemo(() => Object.entries(cart).reduce((sum, [id, q]) => sum + parseUsdc(byId.get(id)?.price ?? '0') * BigInt(q), 0n), [cart, byId])

  if (!products) return <Spinner label="Loading products" />
  const set = (key: keyof typeof customer) => (e: { target: { value: string } }) => setCustomer((c) => ({ ...c, [key]: e.target.value }))
  const available = products.filter((p) => !(p.id in cart))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }))
      const r = await api.post<{ id: string }>(`/workspaces/${workspace.id}/orders`, { items, customer, discountCode: discountCode || undefined, notes })
      toast.success('Order created.')
      void navigate(`/app/${workspace.id}/orders/${r.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="New order" description="Record an order for a customer. Prices, stock and discounts are applied by the server." />
      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Items" />
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex gap-2">
              <Select aria-label="Add a product" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{products.length ? 'Choose a product' : 'No active products yet'}</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.trackInventory && p.stock === 0}>
                    {p.name}{p.trackInventory && p.stock === 0 ? ' (out of stock)' : ''}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" disabled={!pick} onClick={() => { setCart((c) => ({ ...c, [pick]: 1 })); setPick('') }}>
                Add
              </Button>
            </div>
            {Object.entries(cart).map(([id, qty]) => {
              const p = byId.get(id)
              if (!p) return null
              return (
                <div key={id} className="flex items-center gap-3 rounded-xl bg-surface-muted p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <Money value={p.price} className="text-xs text-muted" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setCart((c) => ({ ...c, [id]: qty - 1 }))} className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button type="button" aria-label="Increase quantity" disabled={qty >= 100} onClick={() => setCart((c) => ({ ...c, [id]: qty + 1 }))} className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setCart((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)))} className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-danger"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">Estimated subtotal (before discounts)</span>
              <Money value={formatUsdc(estimate)} className="font-semibold" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Customer" description="Existing customers are matched by email." />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Name" htmlFor="o-name"><Input id="o-name" required minLength={2} value={customer.name} onChange={set('name')} /></Field>
            <Field label="Email" htmlFor="o-email"><Input id="o-email" type="email" required value={customer.email} onChange={set('email')} /></Field>
            <Field label="Phone" htmlFor="o-phone"><Input id="o-phone" type="tel" value={customer.phone} onChange={set('phone')} /></Field>
            <Field label="Country" htmlFor="o-country">
              <Select id="o-country" required value={customer.country} onChange={set('country')}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Address" htmlFor="o-addr"><Input id="o-addr" value={customer.addressLine1} onChange={set('addressLine1')} /></Field></div>
            <Field label="City" htmlFor="o-city"><Input id="o-city" value={customer.city} onChange={set('city')} /></Field>
            <Field label="Postal code" htmlFor="o-postal"><Input id="o-postal" value={customer.postalCode} onChange={set('postalCode')} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Extras" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Discount code" htmlFor="o-disc"><Input id="o-disc" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} /></Field>
            <Field label="Internal note" htmlFor="o-notes"><Textarea id="o-notes" className="min-h-11" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={Object.keys(cart).length === 0}>Create order</Button>
        </div>
      </form>
    </>
  )
}
