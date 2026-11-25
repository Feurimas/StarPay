import { ArrowLeft, Inbox as InboxIcon, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { AiLabel } from '@/components/ai'
import { Money } from '@/components/commerce'
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useApi } from '@/lib/useApi'

interface Conv {
  id: string
  subject: string
  customerName: string
  customerEmail: string
  status: 'open' | 'resolved'
  assignedTo: string | null
  assigneeName: string | null
  tags: string[]
  lastMessage: string | null
  lastSender: string | null
  updatedAt: string
}
interface Detail {
  conversation: Conv
  messages: { id: string; sender: 'customer' | 'agent' | 'ai'; body: string; aiGenerated: boolean; createdAt: string }[]
  notes: { id: string; body: string; aiGenerated: boolean; author: string | null; createdAt: string }[]
  orders: { id: string; number: number; status: string; paymentStatus: string; total: string }[]
}

export default function Inbox() {
  const { workspace } = useWorkspace()
  const { cid } = useParams()
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [assigned, setAssigned] = useState<'all' | 'me' | 'unassigned'>('all')
  const [q, setQ] = useState('')
  const base = `/workspaces/${workspace.id}/support`
  const list = useApi<{ conversations: Conv[] }>(`${base}?status=${status}&assigned=${assigned}&q=${encodeURIComponent(q)}`)

  return (
    <div>
      <PageHeader title="Inbox" description="Customer conversations from your storefront. Messages from other channels appear here once those providers are connected." />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className={`p-3 ${cid ? 'hidden lg:block' : ''}`}>
          <div className="flex gap-1 rounded-lg bg-canvas p-1">
            {(['open', 'resolved'] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`flex-1 rounded-md px-3 py-1 text-sm font-medium capitalize ${status === s ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{s}</button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 text-xs">
            {(['all', 'me', 'unassigned'] as const).map((a) => (
              <button key={a} onClick={() => setAssigned(a)} className={`rounded-full px-2.5 py-1 ${assigned === a ? 'bg-ink text-white' : 'bg-canvas text-muted'}`}>{a === 'me' ? 'Mine' : a === 'all' ? 'All' : 'Unassigned'}</button>
            ))}
          </div>
          <Input className="mt-2" placeholder="Search name, email or subject" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
          <ul className="mt-3 divide-y divide-line">
            {!list.data && !list.error && <li className="py-6"><Spinner /></li>}
            {list.data?.conversations.map((c) => (
              <li key={c.id}>
                <Link to={`/app/${workspace.id}/inbox/${c.id}`} className={`block rounded-lg px-2 py-2.5 hover:bg-canvas ${c.id === cid ? 'bg-canvas' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{c.customerName}</span>
                    <span className="shrink-0 text-[11px] text-muted">{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="truncate text-sm text-ink">{c.subject}</p>
                  <p className="truncate text-xs text-muted">{c.lastSender === 'agent' ? 'You: ' : c.lastSender === 'ai' ? 'AI: ' : ''}{c.lastMessage}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{c.assigneeName ? <Badge>{c.assigneeName}</Badge> : <Badge tone="warning">Unassigned</Badge>}{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
                </Link>
              </li>
            ))}
          </ul>
          {list.data?.conversations.length === 0 && <p className="py-6 text-center text-sm text-muted">No {status} conversations.</p>}
        </Card>
        <div className={cid ? '' : 'hidden lg:block'}>
          {cid ? <Thread key={cid} cid={cid} onChanged={list.reload} /> : (
            <EmptyState icon={<InboxIcon className="h-5 w-5" />} title="Select a conversation" description="Customers start conversations from your storefront's Contact page. Share that link from the Storefront page." />
          )}
        </div>
      </div>
    </div>
  )
}

function Thread({ cid, onChanged }: { cid: string; onChanged: () => void }) {
  const { workspace, can, prefs } = useWorkspace()
  const navigate = useNavigate()
  const base = `/workspaces/${workspace.id}/support/${cid}`
  const { data, error, reload } = useApi<Detail>(base)
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState('')
  const [aiDraft, setAiDraft] = useState(false)
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const manage = can('support.manage')

  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Spinner />
  const c = data.conversation
  const after = () => {
    reload()
    onChanged()
  }
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      after()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    await act(async () => {
      await api.post(`${base}/${mode === 'reply' ? 'reply' : 'notes'}`, { body: text.trim() })
      setText('')
      setAiDraft(false)
    }, mode === 'reply' ? 'Reply sent' : 'Note saved')
  }
  const draft = () =>
    act(async () => {
      const r = await api.post<{ draft: string }>(`${base}/ai-draft`, {})
      setMode('reply')
      setText(r.draft)
      setAiDraft(true)
    })
  const addTag = (e: FormEvent) => {
    e.preventDefault()
    const t = tag.trim().toLowerCase()
    if (!t) return
    void act(async () => {
      await api.patch(base, { tags: [...new Set([...c.tags, t])] })
      setTag('')
    })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <Card className="flex min-h-[460px] flex-col p-0">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <button onClick={() => void navigate(`/app/${workspace.id}/inbox`)} className="mb-1 flex items-center gap-1 text-xs text-muted lg:hidden"><ArrowLeft className="h-3 w-3" /> Back</button>
            <h2 className="truncate font-display text-lg font-semibold text-ink">{c.subject}</h2>
            <p className="text-sm text-muted">{c.customerName} · {c.customerEmail}</p>
          </div>
          {manage && (
            <div className="flex shrink-0 gap-2">
              {c.assignedTo === null && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => api.patch(base, { assignedTo: 'me' }), 'Assigned to you')}>Assign to me</Button>}
              <Button size="sm" variant={c.status === 'open' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void act(() => api.patch(base, { status: c.status === 'open' ? 'resolved' : 'open' }))}>{c.status === 'open' ? 'Resolve' : 'Reopen'}</Button>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {data.messages.map((m) => (
            <div key={m.id} className={m.sender === 'customer' ? 'flex' : 'flex justify-end'}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.sender === 'customer' ? 'bg-canvas text-ink' : m.sender === 'ai' ? 'bg-violet-50 text-ink ring-1 ring-violet-200' : 'bg-ink text-white'}`}>
                <p className={`mb-0.5 flex items-center gap-2 text-[11px] ${m.sender === 'agent' ? 'text-white/70' : 'text-muted'}`}>{m.sender === 'customer' ? c.customerName : m.sender === 'ai' ? <AiLabel /> : 'Team'} · {formatDate(m.createdAt, prefs, true)}</p>
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
            </div>
          ))}
          {data.notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
              <p className="mb-0.5 flex items-center gap-2 text-[11px] text-amber-800">Internal note · {n.aiGenerated ? <AiLabel /> : n.author} · {formatDate(n.createdAt, prefs, true)}</p>
              <p className="whitespace-pre-line">{n.body}</p>
            </div>
          ))}
        </div>
        {manage ? (
          <form onSubmit={(e) => void submit(e)} className="border-t border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-1 text-sm">
                {(['reply', 'note'] as const).map((m) => <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 capitalize ${mode === m ? 'bg-canvas font-medium text-ink' : 'text-muted'}`}>{m === 'reply' ? 'Reply to customer' : 'Internal note'}</button>)}
              </div>
              {can('ai.use') && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void draft()}><Sparkles className="h-3.5 w-3.5" /> Draft with AI</Button>}
            </div>
            {aiDraft && <div className="mb-2"><Alert tone="warning">AI draft. Review and edit before sending. It has not been sent to the customer.</Alert></div>}
            <Textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); }} placeholder={mode === 'reply' ? 'Write a reply the customer will see' : 'Only your team sees notes'} maxLength={4000} aria-label="Message" />
            <div className="mt-2 flex justify-end"><Button type="submit" loading={busy} disabled={!text.trim()}>{mode === 'reply' ? 'Send reply' : 'Save note'}</Button></div>
          </form>
        ) : <p className="border-t border-line p-3 text-sm text-muted">Your role can read conversations but not reply.</p>}
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-sm font-medium text-ink">Status</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={c.status === 'open' ? 'success' : 'neutral'}>{c.status}</Badge>{c.assigneeName ? <Badge>{c.assigneeName}</Badge> : <Badge tone="warning">Unassigned</Badge>}</div>
          <p className="mt-4 text-sm font-medium text-ink">Tags</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}{c.tags.length === 0 && <span className="text-xs text-muted">None</span>}</div>
          {manage && <form onSubmit={addTag} className="mt-2 flex gap-2"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag" maxLength={24} aria-label="New tag" /><Button type="submit" size="sm" variant="secondary" disabled={busy}>Add</Button></form>}
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-ink">Recent orders</p>
          {data.orders.length === 0 && <p className="mt-2 text-xs text-muted">No orders found for this email.</p>}
          <ul className="mt-2 space-y-2">
            {data.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/app/${workspace.id}/orders/${o.id}`} className="block rounded-lg border border-line p-2 text-sm hover:border-brand">
                  <span className="font-medium text-ink">#{o.number}</span> <Money value={o.total} />
                  <span className="mt-1 flex gap-1.5"><Badge>{o.status}</Badge><Badge tone={o.paymentStatus === 'paid' ? 'success' : 'neutral'}>{o.paymentStatus}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
