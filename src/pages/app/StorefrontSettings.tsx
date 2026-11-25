import { Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { buildShareLink } from '@/lib/share'

interface Storefront {
  slug: string
  title: string
  tagline: string
  description: string
  published: boolean
}

export default function StorefrontSettings() {
  const { workspace, can } = useWorkspace()
  const url = `/workspaces/${workspace.id}/storefront`
  const [form, setForm] = useState<Storefront | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const editable = can('storefront.manage')

  useEffect(() => {
    let cancelled = false
    api.get<{ storefront: Storefront }>(url).then((r) => !cancelled && setForm(r.storefront)).catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [url])

  // Resolve the shareable link once the saved address is known (the share base arrives asynchronously).
  const savedSlug = form?.slug
  useEffect(() => {
    if (!savedSlug) return
    let cancelled = false
    void buildShareLink(`/s/${savedSlug}`).then((l) => !cancelled && setLink(l))
    return () => {
      cancelled = true
    }
  }, [savedSlug])

  if (!form) return <Spinner label="Loading storefront" />

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.put(url, form)
      toast.success(form.published ? 'Storefront saved and published.' : 'Storefront saved.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.')
    }
  }

  const set = (key: 'slug' | 'title' | 'tagline' | 'description') => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  return (
    <>
      <PageHeader title="Storefront" description="Your public store page. Customers can browse, add to cart and place orders without an account." action={<Badge tone={form.published ? 'success' : 'warning'}>{form.published ? 'Published' : 'Not published'}</Badge>} />
      <form onSubmit={(e) => void save(e)} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Store page" />
          <fieldset disabled={!editable || busy} className="grid gap-4 p-5 sm:p-6">
            <Field label="Store name" htmlFor="s-title">
              <Input id="s-title" required minLength={2} maxLength={80} value={form.title} onChange={set('title')} />
            </Field>
            <Field label="Tagline" htmlFor="s-tag">
              <Input id="s-tag" maxLength={140} value={form.tagline} onChange={set('tagline')} />
            </Field>
            <Field label="About your store" htmlFor="s-desc">
              <Textarea id="s-desc" maxLength={2000} value={form.description} onChange={set('description')} />
            </Field>
            <Field label="Web address" htmlFor="s-slug" hint="Lowercase letters, numbers and hyphens.">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">/s/</span>
                <Input id="s-slug" required minLength={3} maxLength={40} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
              </div>
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="h-4 w-4 accent-[#0b1b3a]" />
              Publish this storefront
            </label>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Share" description="Send this link to customers. Save any changes first." />
          <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
            <code className="mono min-w-0 flex-1 truncate rounded-xl bg-surface-muted px-3 py-2.5 text-xs">{link || 'Preparing link...'}</code>
            <Button type="button" variant="secondary" disabled={!link} onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> Copy
            </Button>
            <a href={link || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!link || !form.published} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted ${!link ? 'pointer-events-none opacity-55' : ''}`}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Open store
            </a>
          </div>
          {!form.published && <p className="px-5 pb-5 text-sm text-muted sm:px-6">The link shows a "store not available" page until you publish.</p>}
        </Card>

        {editable ? (
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              Save storefront
            </Button>
          </div>
        ) : (
          <Alert tone="info">Your role can view the storefront but not change it.</Alert>
        )}
      </form>
    </>
  )
}
