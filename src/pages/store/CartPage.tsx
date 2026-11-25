import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Money, ProductImage } from '@/components/commerce'
import { Alert, EmptyState, Input, Spinner } from '@/components/ui'
import { useStore } from '@/store/StoreContext'
import { useQuote } from '@/store/useQuote'

export default function CartPage() {
  const { slug, items, setQuantity, remove } = useStore()
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState('')
  const { quote, error, loading } = useQuote(slug, items, applied)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Your cart is empty"
        description="Add something from the store to get started."
        action={<Link to={`/s/${slug}`} className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">Browse products</Link>}
      />
    )
  }

  return (
    <>
      <h1 className="display mb-6 text-3xl font-semibold">Your cart</h1>
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
          {applied && error.toLowerCase().includes('discount') && (
            <button onClick={() => { setApplied(''); setCode('') }} className="mt-2 text-sm font-semibold text-brand hover:underline">Remove discount code</button>
          )}
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ul className="space-y-3">
          {items.map((i) => {
            const line = quote?.lines.find((l) => l.productId === i.productId)
            return (
              <li key={i.productId} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card">
                <ProductImage id={line?.imageId} alt={line?.name ?? 'Product'} className="h-20 w-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{line?.name ?? 'Loading...'}</p>
                  {line && <Money value={line.unitPrice} className="text-sm text-muted" />}
                  <div className="mt-2 flex items-center gap-1">
                    <button aria-label="Decrease quantity" onClick={() => setQuantity(i.productId, i.quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{i.quantity}</span>
                    <button aria-label="Increase quantity" disabled={i.quantity >= 100} onClick={() => setQuantity(i.productId, i.quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                    <button aria-label="Remove item" onClick={() => remove(i.productId)} className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {line && <Money value={line.lineTotal} className="text-sm font-semibold" />}
              </li>
            )
          })}
        </ul>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="display text-lg font-semibold">Summary</h2>
          {loading && !quote ? <Spinner label="Pricing" /> : quote && (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money value={quote.subtotal} /></dd></div>
              {quote.discountCode && <div className="flex justify-between"><dt className="text-muted">Discount ({quote.discountCode})</dt><dd>-<Money value={quote.discount} /></dd></div>}
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd><Money value={quote.total} /></dd></div>
            </dl>
          )}
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(code.trim()) }}>
            <Input aria-label="Discount code" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">Apply</button>
          </form>
          <Link to={`/s/${slug}/checkout`} state={{ discountCode: applied }} aria-disabled={!quote} className={`mt-4 flex min-h-12 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white hover:bg-[#16315f] ${quote ? '' : 'pointer-events-none opacity-50'}`}>
            Continue to checkout
          </Link>
          <p className="mt-3 text-xs text-subtle text-pretty">You pay in USDC on Arc Testnet after placing your order.</p>
        </aside>
      </div>
    </>
  )
}
