import { ShoppingBag, Store } from 'lucide-react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { LogoMark } from '@/components/Logo'
import { EmptyState, Spinner } from '@/components/ui'
import { StoreProvider, useStore } from '@/store/StoreContext'

function Frame() {
  const { slug, loading, unavailable, store, count } = useStore()
  if (loading) return <Spinner label="Loading store" />
  if (unavailable || !store) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <EmptyState icon={<Store className="h-5 w-5" />} title="This store is not available" description="The link may be wrong, or the business has not published its store yet." />
      </div>
    )
  }
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to={`/s/${slug}`} className="display truncate text-lg font-semibold">{store.title}</Link>
          <Link to={`/s/${slug}/cart`} aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`} className="relative flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-surface-muted">
            <ShoppingBag className="h-5 w-5" aria-hidden />
            Cart
            {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs text-white tabular-nums">{count}</span>}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface px-4 py-6 text-center text-xs text-subtle">
        <p className="flex items-center justify-center gap-2"><LogoMark className="h-5 w-5" /> {store.businessName} · checkout powered by StarPay · payments in USDC on Arc Testnet (test funds only)</p>
        <p className="mt-1"><Link to={`/s/${slug}/support`} className="inline-flex min-h-9 items-center underline">Contact the store</Link>{store.supportEmail ? ` · ${store.supportEmail}` : ''}</p>
      </footer>
    </div>
  )
}

export default function StoreLayout() {
  const { slug } = useParams()
  return (
    <StoreProvider key={slug} slug={slug ?? ''}>
      <Frame />
    </StoreProvider>
  )
}
