import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useApi } from '@/lib/useApi'

interface Doc {
  id: string
  title: string
  body: string
  kind: 'faq' | 'policy' | 'note'
  visibility: 'public' | 'internal'
  updatedAt: string
}
const EMPTY = { title: '', body: '', kind: 'faq', visibility: 'internal' }

export default function Knowledge() {
  const { workspace, can, prefs } = useWorkspace()
  const base = `/workspaces/${workspace.id}/knowledge`
  const { data, error: loadError, reload } = useApi<{ docs: Doc[] }>(base)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const manage = can('knowledge.manage')

  const openNew = () => {
    setForm(EMPTY)
    setError('')
    setEditing('new')
  }
  const openEdit = (d: Doc) => {
    setForm({ title: d.title, body: d.body, kind: d.kind, visibility: d.visibility })
    setError('')
    setEditing(d.id)
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (editing === 'new') await api.post(base, form)
      else await api.put(`${base}/${editing}`, form)
      setEditing(null)
      reload()
      toast.success('Saved')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete "${d.title}"?`)) return
    try {
      await api.delete(`${base}/${d.id}`)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="Facts the AI assistant and support drafts can use. Only documents marked public are ever used to answer customers."
        action={manage && <Button onClick={openNew}><Plus className="h-4 w-4" /> Add document</Button>}
      />
      {loadError && <Alert tone="error">{loadError}</Alert>}
      {!data && !loadError && <Spinner />}
      {data && data.docs.length === 0 && (
        <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No documents yet" description="Add your shipping times, returns policy and common questions. The assistant answers only from what you write here and your products." action={manage && <Button onClick={openNew}>Add the first document</Button>} />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.docs.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{d.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={d.visibility === 'public' ? 'success' : 'neutral'}>{d.visibility === 'public' ? 'Public' : 'Internal only'}</Badge>
                  <Badge>{d.kind}</Badge>
                </div>
              </div>
              {manage && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(d)} aria-label={`Edit ${d.title}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)} aria-label={`Delete ${d.title}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
            <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-muted">{d.body}</p>
            <p className="mt-3 text-xs text-muted">Updated {formatDate(d.updatedAt, prefs)}</p>
          </Card>
        ))}
      </div>

      <Modal open={editing !== null} title={editing === 'new' ? 'Add document' : 'Edit document'} onClose={() => setEditing(null)}>
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Title" htmlFor="kt"><Input id="kt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} maxLength={120} /></Field>
          <Field label="Content" htmlFor="kb" hint="Plain text. Keep one topic per document."><Textarea id="kb" rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required minLength={5} maxLength={8000} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="kk">
              <Select id="kk" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="faq">FAQ</option><option value="policy">Policy</option><option value="note">Internal note</option>
              </Select>
            </Field>
            <Field label="Who can the AI share it with?" htmlFor="kv">
              <Select id="kv" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                <option value="internal">Team only</option><option value="public">Customers too</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
        </form>
      </Modal>
    </div>
  )
}
