import { ArrowLeft, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Money, ProductImage } from '@/components/commerce'
import { Badge, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useStore } from '@/store/StoreContext'

interface ProductData {
  id: string
  name: string
  description: string
  price: string
  categoryName: string | null
  availability: 'in_stock' | 'low' | 'out'
  remaining: number | null
  imageIds: string[]
}

export default function ProductPage() {
  const { slug, add } = useStore()
  const { pid } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<ProductData | null>(null)
  const [active, setActive] = useState(0)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ product: ProductData }>(`/public/stores/${slug}/products/${pid}`)
      .then((r) => !cancelled && setProduct(r.product))
      .catch(() => {
        toast.error('That product is no longer available.')
        void navigate(`/s/${slug}`, { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [slug, pid, navigate])

  if (!product) return <Spinner label="Loading product" />
  const soldOut = product.availability === 'out'
  const max = product.remaining ?? 100

  return (
    <>
      <Link to={`/s/${slug}`} className="mb-6 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden /> All products</Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <ProductImage id={product.imageIds[active]} alt={product.name} className="aspect-square w-full rounded-2xl" />
          {product.imageIds.length > 1 && (
            <div className="mt-3 flex gap-2">
              {product.imageIds.map((id, i) => (
                <button key={id} aria-label={`Show photo ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)} className={`overflow-hidden rounded-xl ring-2 ${i === active ? 'ring-ink' : 'ring-transparent'}`}>
                  <ProductImage id={id} alt="" className="h-16 w-16" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          {product.categoryName && <p className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">{product.categoryName}</p>}
          <h1 className="display mt-1 text-3xl font-semibold text-balance">{product.name}</h1>
          <Money value={product.price} className="mt-2 block text-xl font-semibold" />
          <div className="mt-2">
            {soldOut ? <Badge tone="danger">Sold out</Badge> : product.availability === 'low' ? <Badge tone="warning">Only {product.remaining} left</Badge> : <Badge tone="success">In stock</Badge>}
          </div>
          {product.description && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-ink-2 text-pretty">{product.description}</p>}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-line bg-surface">
              <button aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="flex h-11 w-11 items-center justify-center disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(qty + 1)} className="flex h-11 w-11 items-center justify-center disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </div>
            <button disabled={soldOut} onClick={() => { add(product.id, qty); toast.success('Added to cart.') }} className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white hover:bg-[#16315f] disabled:opacity-50">
              {soldOut ? 'Sold out' : 'Add to cart'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
