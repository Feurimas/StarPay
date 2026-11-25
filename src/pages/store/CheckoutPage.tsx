import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Money } from '@/components/commerce'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import { useStore } from '@/store/StoreContext'
import { useQuote } from '@/store/useQuote'

export default function CheckoutPage() {
  const { slug, items, clear } = useStore()
  const navigate = useNavigate()
  const [placed, setPlaced] = useState(false)
  const location = useLocation()
  const discountCode = (location.state as { discountCode?: string } | null)?.discountCode ?? ''
  const { quote, error: quoteError, loading } = useQuote(slug, items, discountCode)
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '' })
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (items.length === 0 && !placed) return <Navigate to={`/s/${slug}/cart`} replace />
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ publicId: string }>(`/public/stores/${slug}/orders`, { items, customer: form, discountCode: discountCode || undefined, notes })
      setPlaced(true) // the cart empties on purpose now: do not bounce to the empty cart page
      void navigate(`/order/${r.publicId}`, { replace: true })
      clear()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="display mb-6 text-3xl font-semibold">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          {(error || quoteError) && <Alert tone="error">{error || quoteError}</Alert>}
          <h2 className="display text-lg font-semibold">Your details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="k-name"><Input id="k-name" autoComplete="name" required minLength={2} value={form.name} onChange={set('name')} /></Field>
            <Field label="Email" htmlFor="k-email" hint="Order updates go here."><Input id="k-email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
            <Field label="Phone (optional)" htmlFor="k-phone"><Input id="k-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Country" htmlFor="k-country">
              <Select id="k-country" autoComplete="country" required value={form.country} onChange={set('country')}>
                <option value="" disabled>Select a country</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Address" htmlFor="k-a1"><Input id="k-a1" autoComplete="address-line1" value={form.addressLine1} onChange={set('addressLine1')} /></Field></div>
            <Field label="City" htmlFor="k-city"><Input id="k-city" autoComplete="address-level2" value={form.city} onChange={set('city')} /></Field>
            <Field label="Postal code" htmlFor="k-postal"><Input id="k-postal" autoComplete="postal-code" value={form.postalCode} onChange={set('postalCode')} /></Field>
            <div className="sm:col-span-2"><Field label="Order note (optional)" htmlFor="k-notes"><Textarea id="k-notes" className="min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
          </div>
          <Alert tone="info">You will pay in USDC from your own wallet on the next page. Nothing is charged until you approve the payment in your wallet.</Alert>
          <Button type="submit" loading={busy} disabled={!quote} className="w-full min-h-12">Place order</Button>
        </form>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="display text-lg font-semibold">Order summary</h2>
          {loading && !quote ? <Spinner label="Pricing" /> : quote && (
            <>
              <ul className="mt-4 space-y-2 text-sm">
                {quote.lines.map((l) => (
                  <li key={l.productId} className="flex justify-between gap-3"><span className="min-w-0 truncate">{l.name} x {l.quantity}</span><Money value={l.lineTotal} /></li>
                ))}
              </ul>
              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                {quote.discountCode && <div className="flex justify-between"><dt className="text-muted">Discount ({quote.discountCode})</dt><dd>-<Money value={quote.discount} /></dd></div>}
                <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd><Money value={quote.total} /></dd></div>
              </dl>
            </>
          )}
          <Link to={`/s/${slug}/cart`} className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Edit cart</Link>
        </aside>
      </div>
    </>
  )
}
