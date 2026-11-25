import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Money, ProductImage } from '@/components/commerce'
import { Badge, EmptyState } from '@/components/ui'
import { clsx } from 'clsx'
import { useStore } from '@/store/StoreContext'

export default function StorePage() {
  const { slug, store, categories, products, add } = useStore()
  const [category, setCategory] = useState('')
  if (!store) return null
  const shown = category ? products.filter((p) => p.categoryId === category) : products

  return (
    <>
      <section className="mb-8">
        <h1 className="display text-4xl font-semibold text-balance">{store.title}</h1>
        {store.tagline && <p className="mt-2 text-lg text-muted text-pretty">{store.tagline}</p>}
        {store.description && <p className="mt-3 max-w-2xl text-[15px] text-ink-2 text-pretty">{store.description}</p>}
      </section>
      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Categories">
          {[{ id: '', name: 'All' }, ...categories].map((c) => (
            <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={clsx('min-h-10 rounded-full px-4 text-sm font-medium', category === c.id ? 'bg-ink text-white' : 'bg-surface text-ink-2 ring-1 ring-line hover:bg-surface-muted')}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState icon={<Plus className="h-5 w-5" />} title="Nothing here yet" description="This store has no products to show right now." />
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <Link to={`/s/${slug}/p/${p.id}`} className="block">
                <ProductImage id={p.imageId} alt={p.name} className="aspect-square w-full" />
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <Link to={`/s/${slug}/p/${p.id}`} className="text-[15px] font-semibold hover:underline">{p.name}</Link>
                <Money value={p.price} className="text-sm text-muted" />
                {p.availability === 'low' && <Badge tone="warning">Low stock</Badge>}
                <div className="mt-auto pt-3">
                  <button
                    disabled={p.availability === 'out'}
                    onClick={() => { add(p.id); toast.success(`${p.name} added to cart.`) }}
                    className="flex min-h-11 w-full items-center justify-center rounded-full bg-ink text-sm font-semibold text-white hover:bg-[#16315f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.availability === 'out' ? 'Sold out' : 'Add to cart'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
