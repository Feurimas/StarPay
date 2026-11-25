import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'

export interface StoreInfo {
  slug: string
  title: string
  tagline: string
  description: string
  businessName: string
  supportEmail: string | null
}

export interface StoreProduct {
  id: string
  name: string
  description: string
  price: string
  categoryId: string | null
  imageId: string | null
  availability: 'in_stock' | 'low' | 'out'
}

export interface CartItem {
  productId: string
  quantity: number
}

interface StoreState {
  slug: string
  loading: boolean
  unavailable: boolean
  store: StoreInfo | null
  categories: { id: string; name: string }[]
  products: StoreProduct[]
  items: CartItem[]
  count: number
  add: (productId: string, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const StoreContext = createContext<StoreState | null>(null)
const cartKey = (slug: string) => `starpay.cart.${slug}`

function readCart(slug: string): CartItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(cartKey(slug)) ?? '[]')
    if (!Array.isArray(raw)) return []
    const out: CartItem[] = []
    for (const entry of raw as unknown[]) {
      const i = entry as { productId?: unknown; quantity?: unknown }
      if (typeof i.productId === 'string' && typeof i.quantity === 'number' && Number.isInteger(i.quantity) && i.quantity > 0) {
        out.push({ productId: i.productId, quantity: Math.min(100, i.quantity) })
      }
    }
    return out
  } catch {
    return []
  }
}

export function StoreProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; unavailable: boolean; store: StoreInfo | null; categories: { id: string; name: string }[]; products: StoreProduct[] }>({
    loading: true, unavailable: false, store: null, categories: [], products: [],
  })
  const [items, setItems] = useState<CartItem[]>(() => readCart(slug))

  useEffect(() => {
    let cancelled = false
    api
      .get<{ store: StoreInfo; categories: { id: string; name: string }[]; products: StoreProduct[] }>(`/public/stores/${slug}`)
      .then((r) => !cancelled && setState({ loading: false, unavailable: false, ...r }))
      .catch((e) => !cancelled && setState({ loading: false, unavailable: e instanceof ApiError && e.status === 404, store: null, categories: [], products: [] }))
    return () => {
      cancelled = true
    }
  }, [slug])

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next)
      localStorage.setItem(cartKey(slug), JSON.stringify(next))
    },
    [slug],
  )

  const value = useMemo<StoreState>(
    () => ({
      slug,
      ...state,
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      add: (productId, quantity = 1) => {
        const existing = items.find((i) => i.productId === productId)
        persist(existing ? items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(100, i.quantity + quantity) } : i)) : [...items, { productId, quantity }])
      },
      setQuantity: (productId, quantity) => persist(quantity <= 0 ? items.filter((i) => i.productId !== productId) : items.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(100, quantity) } : i))),
      remove: (productId) => persist(items.filter((i) => i.productId !== productId)),
      clear: () => persist([]),
    }),
    [slug, state, items, persist],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
