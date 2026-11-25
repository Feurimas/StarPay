import { Package, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Money, ProductImage, ProductStatusBadge } from '@/components/commerce'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'

export interface ProductSummary {
  id: string
  name: string
  price: string
  sku: string | null
  trackInventory: boolean
  stock: number
  status: string
  categoryName: string | null
  imageId: string | null
}

export default function Products() {
  const { workspace, can } = useWorkspace()
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const base = `/app/${workspace.id}`

  useEffect(() => {
    let cancelled = false
    api
      .get<{ products: ProductSummary[] }>(`/workspaces/${workspace.id}/products${status ? `?status=${status}` : ''}`)
      .then((r) => !cancelled && setProducts(r.products))
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id, status])

  const shown = products?.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalog. Only active products appear in your storefront."
        action={
          can('products.manage') && (
            <Link to={`${base}/products/new`}>
              <Button>
                <Plus className="h-4 w-4" aria-hidden /> Add product
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label="Search products" placeholder="Search by name or SKU" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" className="w-44" value={status} onChange={(e) => { setProducts(null); setStatus(e.target.value) }}>
          <option value="">Active and draft</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {!shown ? (
        <Spinner label="Loading products" />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title={products?.length ? 'No products match' : 'No products yet'}
            description={products?.length ? 'Try a different search or filter.' : 'Add your first product to start building your storefront.'}
            action={
              can('products.manage') && !products?.length ? (
                <Link to={`${base}/products/new`}>
                  <Button>Add product</Button>
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {shown.map((p) => (
              <li key={p.id}>
                <Link to={`${base}/products/${p.id}`} className="flex min-h-20 items-center gap-4 px-4 py-3 hover:bg-surface-muted sm:px-6">
                  <ProductImage id={p.imageId} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[p.categoryName, p.sku && `SKU ${p.sku}`].filter(Boolean).join(' · ') || 'No category'}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    {p.trackInventory ? (
                      p.stock === 0 ? <Badge tone="danger">Out of stock</Badge> : <span className="text-sm text-muted tabular-nums">{p.stock} in stock</span>
                    ) : (
                      <span className="text-sm text-subtle">Not tracked</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money value={p.price} className="text-sm font-semibold" />
                    <ProductStatusBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
