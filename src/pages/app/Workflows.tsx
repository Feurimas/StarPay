import { Play, Plus, Trash2, Workflow } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import { useApi } from '@/lib/useApi'

export const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Run manually',
  'order.created': 'A new order is placed',
  'payment.verified': 'A USDC payment is verified onchain',
  'order.status_changed': 'An order status changes',
  'support.message': 'A customer sends a message',
  'schedule.daily': 'Every day',
}

interface Wf {
  id: string
  name: string
  enabled: boolean
  trigger: string
  lastRunStatus: string | null
  lastRunAt: string | null
}
interface Meta {
  triggers: string[]
  templates: { id: string; name: string; description: string; trigger: string }[]
}

export default function Workflows() {
  const { workspace, can } = useWorkspace()
  const navigate = useNavigate()
  const base = `/workspaces/${workspace.id}`
  const list = useApi<{ workflows: Wf[] }>(`${base}/workflows`)
  const meta = useApi<Meta>(`${base}/workflow-meta`)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('order.created')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const manage = can('workflows.manage')

  const create = async (body: Record<string, string>) => {
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ id: string }>(`${base}/workflows`, body)
      void navigate(`/app/${workspace.id}/workflows/${r.id}`)
    } catch (e) {
      setError(errorMessage(e))
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void create({ name, trigger })
  }
  const toggle = async (w: Wf) => {
    try {
      await api.post(`${base}/workflows/${w.id}/enabled`, { enabled: !w.enabled })
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const remove = async (w: Wf) => {
    if (!window.confirm(`Delete "${w.name}" and its run history?`)) return
    await api.delete(`${base}/workflows/${w.id}`)
    list.reload()
  }

  return (
    <div>
      <PageHeader title="Workflows" description="Automate routine work. Workflows can notify your team, update fulfilment, issue invoices and draft text. They can never send or approve a payment, and payments are only confirmed by onchain verification." action={manage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New workflow</Button>} />
      {list.error && <Alert tone="error">{list.error}</Alert>}
      {!list.data && !list.error && <Spinner />}
      {list.data && (list.data.workflows || []).length === 0 && (
        <EmptyState icon={<Workflow className="h-5 w-5" />} title="No workflows yet" description="Start from a template or build your own on the visual canvas." action={manage && <Button onClick={() => setOpen(true)}>Create a workflow</Button>} />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {(list.data?.workflows || []).map((w) => (
          <Card key={w.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/app/${workspace.id}/workflows/${w.id}`} className="block truncate font-medium text-ink hover:text-brand">{w.name}</Link>
                <p className="mt-0.5 text-sm text-muted">When: {TRIGGER_LABELS[w.trigger] ?? w.trigger}</p>
              </div>
              <Badge tone={w.enabled ? 'success' : 'neutral'}>{w.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
            <p className="mt-3 text-xs text-muted">{w.lastRunAt ? <>Last run {relativeTime(w.lastRunAt)}: <span className={w.lastRunStatus === 'failed' ? 'font-medium text-red-600' : ''}>{w.lastRunStatus}</span></> : 'Never run'}</p>
            <div className="mt-3 flex gap-2">
              <Link to={`/app/${workspace.id}/workflows/${w.id}`} className="inline-flex"><Button size="sm" variant="secondary"><Play className="h-3.5 w-3.5" /> Open</Button></Link>
              {manage && <Button size="sm" variant="secondary" onClick={() => void toggle(w)}>{w.enabled ? 'Disable' : 'Enable'}</Button>}
              {manage && <Button size="sm" variant="ghost" onClick={() => void remove(w)} aria-label={`Delete ${w.name}`}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} title="New workflow" onClose={() => setOpen(false)}>
        {error && <Alert tone="error">{error}</Alert>}
        <p className="mb-2 text-sm font-medium text-ink">Start from a template</p>
        <ul className="space-y-2">
          {(meta.data?.templates || []).map((t) => (
            <li key={t.id}>
              <button disabled={busy} onClick={() => void create({ template: t.id })} className="w-full rounded-xl border border-line p-3 text-left hover:border-brand disabled:opacity-60">
                <span className="block text-sm font-medium text-ink">{t.name}</span>
                <span className="block text-xs text-muted">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">Or start blank</p>
          <Field label="Name" htmlFor="wn"><Input id="wn" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} /></Field>
          <Field label="Starts when" htmlFor="wt">
            <Select id="wt" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {(meta.data?.triggers || ["order.created", "payment.verified", "order.status_changed", "support.message", "schedule.daily", "manual"]).map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t] ?? t}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" loading={busy}>Create blank workflow</Button></div>
        </form>
      </Modal>
    </div>
  )
}
