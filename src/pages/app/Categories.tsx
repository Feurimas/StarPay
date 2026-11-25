import { Package, Plus, Trash2, Tag } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'

interface Category {
  id: string
  name: string
}

export default function Categories() {
  const { workspace, can } = useWorkspace()
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editable = can('products.manage')
  const base = `/workspaces/${workspace.id}`

  const loadCategories = async () => {
    try {
      const res = await api.get<{ categories: Category[] }>(`${base}/categories`)
      setCategories(Array.isArray(res?.categories) ? res.categories : [])
    } catch (err) {
      setCategories([])
      toast.error(errorMessage(err))
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [base])

  const addCategory = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post(`${base}/categories`, { name: newName.trim() })
      toast.success('Category added.')
      setNewName('')
      void loadCategories()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const deleteCategory = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return
    try {
      await api.delete(`${base}/categories/${id}`)
      toast.success('Category deleted.')
      setCategories((prev) => (prev || []).filter((c) => c.id !== id))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize your products into catalog categories for your storefront."
        action={
          <Link to={`/app/${workspace.id}/products`}>
            <Button variant="secondary">
              <Package className="h-4 w-4" aria-hidden /> View products
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {!categories ? (
            <Spinner label="Loading categories" />
          ) : categories.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Tag className="h-5 w-5" />}
                title="No categories yet"
                description="Create categories like Apparel, Electronics, or Digital Downloads to group products."
              />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {categories.map((c) => (
                  <li key={c.id} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 hover:bg-surface-muted sm:px-6">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink">
                        <Tag className="h-4 w-4" />
                      </span>
                      <span className="truncate font-semibold text-sm">{c.name}</span>
                    </div>
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteCategory(c.id, c.name)}
                        className="text-danger hover:bg-danger-soft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <Card>
            <div className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">Add new category</h2>
              <p className="mt-1 text-xs text-muted">Categories appear as filter tabs in your public storefront.</p>
              {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
              <form onSubmit={(e) => void addCategory(e)} className="mt-4 space-y-4">
                <Field label="Category name" htmlFor="catName">
                  <Input
                    id="catName"
                    required
                    placeholder="e.g. Shoes, Accessories, Services"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </Field>
                <Button type="submit" loading={busy} disabled={newName.trim().length < 2 || !editable} className="w-full">
                  <Plus className="h-4 w-4" aria-hidden /> Create category
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
