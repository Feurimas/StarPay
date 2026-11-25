import { AiLabel } from '@/components/ai'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { ProductImage, ProductStatusBadge } from '@/components/commerce'
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { prepareImage } from '@/lib/image'
import { cleanAmountInput } from '@/lib/usdc'

interface Category {
  id: string
  name: string
}

interface ProductDetail {
  product: {
    id: string
    name: string
    description: string
    price: string
    sku: string | null
    trackInventory: boolean
    stock: number
    status: string
    categoryId: string | null
  }
  imageIds: string[]
}

const EMPTY = { name: '', description: '', price: '', sku: '', trackInventory: false, stock: '0', status: 'draft', categoryId: '' }

export default function ProductForm() {
  const { workspace, can } = useWorkspace()
  const { pid } = useParams()
  const isNew = !pid || pid === 'new'
  const navigate = useNavigate()
  const base = `/workspaces/${workspace.id}`
  const [form, setForm] = useState(EMPTY)
  const [loaded, setLoaded] = useState(isNew)
  const [images, setImages] = useState<string[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = can('products.manage')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiDrafted, setAiDrafted] = useState(false)
  const draftWithAi = async () => {
    setAiBusy(true)
    try {
      const r = await api.post<{ draft: string }>(`${base}/assistant/describe`, { name: form.name, notes: form.description })
      setForm((f) => ({ ...f, description: r.draft }))
      setAiDrafted(true)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setAiBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api.get<{ categories: Category[] }>(`${base}/categories`).then((r) => !cancelled && setCategories(Array.isArray(r?.categories) ? r.categories : [])).catch(() => undefined)
    if (!isNew) {
      api
        .get<ProductDetail>(`${base}/products/${pid}`)
        .then((r) => {
          if (cancelled) return
          const prod = r?.product;
          if (prod) {
            setForm({ name: prod.name || '', description: prod.description || '', price: prod.price || '0.00', sku: prod.sku ?? '', trackInventory: Boolean(prod.trackInventory), stock: String(prod.stock ?? 0), status: prod.status || 'draft', categoryId: prod.categoryId ?? '' });
            setImages(Array.isArray(r.imageIds) ? r.imageIds : []);
          }
          setLoaded(true);
        })
        .catch((e) => {
          toast.error(errorMessage(e))
          void navigate(`/app/${workspace.id}/products`, { replace: true })
        })
    }
    return () => {
      cancelled = true
    }
  }, [base, pid, isNew, navigate, workspace.id])

  if (!loaded) return <Spinner label="Loading product" />
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const price = cleanAmountInput(form.price)
    if (!price) {
      setError('Enter a price such as 12.50 (up to 6 decimals).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = { ...form, price, stock: form.trackInventory ? Number(form.stock) : 0 }
      if (isNew) {
        const r = await api.post<{ id: string }>(`${base}/products`, body)
        toast.success('Product created. Add photos next.')
        void navigate(`/app/${workspace.id}/products/${r.id}`, { replace: true })
      } else {
        await api.put(`${base}/products/${pid}`, body)
        toast.success('Product saved.')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addCategory = async () => {
    try {
      const r = await api.post<{ id: string }>(`${base}/categories`, { name: newCategory })
      setCategories((c) => [...c, { id: r.id, name: newCategory.trim() }])
      setForm((f) => ({ ...f, categoryId: r.id }))
      setNewCategory('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length || isNew) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await prepareImage(file)
        const r = await api.upload<{ id: string }>(`${base}/products/${pid}/images`, blob)
        setImages((list) => [...list, r.id])
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = async (id: string) => {
    try {
      await api.delete(`${base}/images/${id}`)
      setImages((list) => list.filter((i) => i !== id))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const archive = async () => {
    if (!confirm('Archive this product? It disappears from your storefront but past orders keep it.')) return
    try {
      await api.delete(`${base}/products/${pid}`)
      toast.success('Product archived.')
      void navigate(`/app/${workspace.id}/products`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={isNew ? 'New product' : form.name || 'Product'}
        description={isNew ? 'Add the details, then upload photos.' : undefined}
        action={!isNew ? <ProductStatusBadge status={form.status} /> : undefined}
      />
      <form onSubmit={(e) => void save(e)} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Details" />
          <fieldset disabled={!editable || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <Field label="Name" htmlFor="pname">
                <Input id="pname" required minLength={2} maxLength={120} value={form.name} onChange={set('name')} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="pdesc">
                <Textarea id="pdesc" maxLength={4000} value={form.description} onChange={set('description')} />
              </Field>
              {editable && can('ai.use') && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" loading={aiBusy} disabled={form.name.trim().length < 2} onClick={() => void draftWithAi()}>Draft with AI</Button>
                  {aiDrafted && <AiLabel />}
                  <span className="text-xs text-muted">Uses only the name and description you have typed. Review before saving.</span>
                </div>
              )}
            </div>
            <Field label="Price (USDC)" htmlFor="pprice" hint="Priced and paid in USDC. Up to 6 decimals.">
              <Input id="pprice" inputMode="decimal" required placeholder="0.00" value={form.price} onChange={set('price')} />
            </Field>
            <Field label="SKU" htmlFor="psku">
              <Input id="psku" maxLength={60} value={form.sku} onChange={set('sku')} />
            </Field>
            <Field label="Category" htmlFor="pcat">
              <Select id="pcat" value={form.categoryId} onChange={set('categoryId')}>
                <option value="">No category</option>
                {(categories || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="New category" htmlFor="pnewcat">
              <div className="flex gap-2">
                <Input id="pnewcat" placeholder="e.g. Drinkware" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                <Button type="button" variant="secondary" disabled={newCategory.trim().length < 2} onClick={() => void addCategory()}>
                  Add
                </Button>
              </div>
            </Field>
            <Field label="Status" htmlFor="pstatus" hint="Active products are visible in a published storefront.">
              <Select id="pstatus" value={form.status} onChange={set('status')}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Inventory" description="Turn on tracking to stop selling at zero stock. Stock is reserved when an order is placed and returned if it is cancelled." />
          <fieldset disabled={!editable || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={form.trackInventory} onChange={(e) => setForm((f) => ({ ...f, trackInventory: e.target.checked }))} className="h-4 w-4 accent-[#0b1b3a]" />
              Track inventory for this product
            </label>
            {form.trackInventory && (
              <Field label="Units in stock" htmlFor="pstock">
                <Input id="pstock" type="number" min={0} max={1000000} step={1} required value={form.stock} onChange={set('stock')} />
              </Field>
            )}
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Photos" description="JPEG, PNG or WebP. Photos are resized in your browser before upload. Up to 6." />
          <div className="p-5 sm:p-6">
            {isNew ? (
              <Alert tone="info">Save the product first, then add photos.</Alert>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map((id, i) => (
                  <div key={id} className="group relative">
                    <ProductImage id={id} alt={`${form.name} photo ${i + 1}`} className="h-28 w-28 rounded-xl" />
                    {editable && (
                      <button type="button" onClick={() => void removeImage(id)} aria-label={`Remove photo ${i + 1}`} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 text-danger shadow">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {editable && images.length < 6 && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border-strong)] text-sm text-muted hover:bg-surface-muted disabled:opacity-60">
                    <ImagePlus className="h-5 w-5" aria-hidden />
                    {uploading ? 'Uploading' : 'Add photo'}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
              </div>
            )}
          </div>
        </Card>

        {editable ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!isNew && form.status !== 'archived' ? (
              <Button type="button" variant="ghost" onClick={() => void archive()}>
                Archive product
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={busy}>
              {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </div>
        ) : (
          <Alert tone="info">Your role can view products but not change them.</Alert>
        )}
      </form>
    </>
  )
}
