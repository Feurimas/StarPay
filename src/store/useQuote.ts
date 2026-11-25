import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import type { CartItem } from './StoreContext'

export interface QuoteLine {
  productId: string
  name: string
  unitPrice: string
  quantity: number
  lineTotal: string
  imageId: string | null
}

export interface Quote {
  lines: QuoteLine[]
  subtotal: string
  discountCode: string | null
  discount: string
  total: string
}

/** Prices come from the server on every change; the browser never computes what will be charged. */
export function useQuote(slug: string, items: CartItem[], discountCode: string) {
  const key = useMemo(() => JSON.stringify({ items, discountCode }), [items, discountCode])
  const [result, setResult] = useState<{ key: string; quote: Quote | null; error: string }>({ key: '', quote: null, error: '' })

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    api
      .post<{ cart: Quote }>(`/public/stores/${slug}/quote`, { items, discountCode: discountCode || undefined })
      .then((r) => !cancelled && setResult({ key, quote: r.cart, error: '' }))
      .catch((e) => !cancelled && setResult({ key, quote: null, error: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [slug, items, discountCode, key])

  const current = items.length > 0 && result.key === key
  return { quote: current ? result.quote : null, error: current ? result.error : '', loading: items.length > 0 && !current }
}
