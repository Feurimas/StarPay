import { Bot, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { AiLabel, AiNotConfigured } from '@/components/ai'
import { Alert, Badge, Button, Card, CardHeader, Field, PageHeader, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/useApi'

interface Settings {
  configured: boolean
  instructions: string
  autoReply: boolean
}
interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { type: string; id: string; title: string }[]
}
interface Stats {
  days: number
  orders?: { total: number; pending: number; processing: number; fulfilled: number; cancelled: number; valueUsdc: string }
  payments?: { verifiedCount: number; verifiedUsdc: string }
  support?: { open: number }
  lowStockProducts?: number
}

const TABS = ['Chat', 'Report', 'Settings'] as const
const SUGGESTIONS = ['How many orders are waiting for me to process?', 'Which of my products are low on stock?', 'Summarize my returns policy for a customer.']

export default function Assistant() {
  const { workspace, can } = useWorkspace()
  const base = `/workspaces/${workspace.id}/assistant`
  const settings = useApi<Settings>(`${base}/settings`)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Chat')
  const usable = can('ai.use')

  return (
    <div>
      <PageHeader title="AI assistant" description="Ask questions about your business. Answers use only your own data and knowledge base, and the assistant can never move money or change records." />
      {settings.data && !settings.data.configured && <div className="mb-4"><AiNotConfigured /></div>}
      {!usable && <Alert tone="info">Your role can read this page but cannot use the assistant. Ask an owner or admin to change your role.</Alert>}
      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line sm:w-fit" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Chat' && <Chat base={base} disabled={!usable || !settings.data?.configured} />}
      {tab === 'Report' && <Report base={base} disabled={!usable} />}
      {tab === 'Settings' && <SettingsTab base={base} settings={settings.data} reload={settings.reload} canEdit={can('ai.settings')} />}
    </div>
  )
}

function Chat({ base, disabled }: { base: string; disabled: boolean }) {
  const list = useApi<{ conversations: { id: string; title: string }[] }>(`${base}/conversations`)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  const open = async (id: string) => {
    setActiveId(id)
    setError('')
    try {
      setMessages((await api.get<{ messages: Msg[] }>(`${base}/conversations/${id}`)).messages)
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const fresh = () => {
    setActiveId(null)
    setMessages([])
    setError('')
  }
  const remove = async (id: string) => {
    await api.delete(`${base}/conversations/${id}`)
    if (id === activeId) fresh()
    list.reload()
  }
  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const message = (preset ?? text).trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    setText('')
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: message }])
    try {
      const r = await api.post<{ conversationId: string; message: Msg }>(`${base}/chat`, { conversationId: activeId ?? undefined, message })
      setActiveId(r.conversationId)
      setMessages((m) => [...m, r.message])
      list.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="p-3">
        <Button variant="secondary" size="sm" className="w-full" onClick={fresh}><Plus className="h-4 w-4" /> New chat</Button>
        <ul className="mt-3 space-y-1">
          {list.data?.conversations.map((c) => (
            <li key={c.id} className={`group flex items-center gap-1 rounded-lg ${c.id === activeId ? 'bg-canvas' : ''}`}>
              <button onClick={() => void open(c.id)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-ink hover:text-brand">{c.title}</button>
              <button onClick={() => void remove(c.id)} className="p-1.5 text-muted opacity-60 hover:text-red-600 hover:opacity-100" aria-label={`Delete chat ${c.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {list.data?.conversations.length === 0 && <li className="px-2 py-1 text-xs text-muted">No chats yet.</li>}
        </ul>
      </Card>
      <Card className="flex min-h-[420px] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md pt-8 text-center">
              <Bot className="mx-auto h-8 w-8 text-brand" aria-hidden />
              <p className="mt-3 font-medium text-ink">Ask about your business</p>
              <p className="mt-1 text-sm text-muted">Figures come from your real orders and verified payments. Answers can be wrong, so check anything important.</p>
              <div className="mt-4 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} disabled={disabled || busy} onClick={() => void send(undefined, s)} className="rounded-lg border border-line px-3 py-2 text-left text-sm text-ink hover:border-brand disabled:opacity-50">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-ink text-white' : 'bg-canvas text-ink'}`}>
                {m.role === 'assistant' && <div className="mb-1"><AiLabel /></div>}
                <p className="whitespace-pre-line">{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                    <span className="text-xs text-muted">Used:</span>
                    {m.sources.map((s) => <Badge key={s.id}>{s.title}</Badge>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-muted">Thinking…</p>}
          <div ref={bottom} />
        </div>
        {error && <div className="px-4 pb-2"><Alert tone="error">{error}</Alert></div>}
        <form onSubmit={(e) => void send(e)} className="flex gap-2 border-t border-line p-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder={disabled ? 'The assistant is unavailable' : 'Ask a question'} disabled={disabled || busy} aria-label="Message"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <Button type="submit" disabled={disabled || busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </Card>
    </div>
  )
}

function Report({ base, disabled }: { base: string; disabled: boolean }) {
  const [days, setDays] = useState(30)
  const [result, setResult] = useState<{ stats: Stats; narrative: string | null; aiConfigured: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await api.post(`${base}/report`, { days }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const s = result?.stats
  return (
    <Card>
      <CardHeader title="Business report" description="Figures are computed from your records. The written summary is AI-generated from those figures." />
      <div className="flex flex-wrap items-end gap-3 p-4 pt-0">
        <Field label="Period" htmlFor="days">
          <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
            <option value={1}>Last day</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </Field>
        <Button onClick={() => void run()} loading={busy} disabled={disabled}>Generate report</Button>
      </div>
      {error && <div className="p-4 pt-0"><Alert tone="error">{error}</Alert></div>}
      {busy && !result && <Spinner label="Building report" />}
      {s && (
        <div className="space-y-4 p-4 pt-0">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.orders && <Fact label="Orders" value={String(s.orders.total)} note="Offchain business records" />}
            {s.orders && <Fact label="Order value" value={`${s.orders.valueUsdc} USDC`} note="Offchain, excludes cancelled" />}
            {s.payments && <Fact label="Verified payments" value={`${s.payments.verifiedCount} · ${s.payments.verifiedUsdc} USDC`} note="Confirmed onchain" tone="success" />}
            {s.support && <Fact label="Open conversations" value={String(s.support.open)} note="Support inbox" />}
          </dl>
          {result.narrative ? (
            <div className="rounded-xl bg-canvas p-4"><div className="mb-2"><AiLabel /></div><p className="whitespace-pre-line text-sm text-ink">{result.narrative}</p></div>
          ) : (
            <Alert tone="info">The written summary needs the AI provider to be connected. The figures above are real.</Alert>
          )}
        </div>
      )}
    </Card>
  )
}

function Fact({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'success' }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${tone === 'success' ? 'text-emerald-700' : 'text-ink'}`}>{value}</dd>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </div>
  )
}

function SettingsTab({ base, settings, reload, canEdit }: { base: string; settings: Settings | null; reload: () => void; canEdit: boolean }) {
  const [instructions, setInstructions] = useState<string | null>(null)
  const [autoReply, setAutoReply] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  if (!settings) return <Spinner />
  const ins = instructions ?? settings.instructions
  const auto = autoReply ?? settings.autoReply
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put(`${base}/settings`, { instructions: ins, autoReply: auto })
      toast.success('AI settings saved')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader title="Assistant settings" description="Owners and admins control how the assistant behaves." />
      <form onSubmit={(e) => void save(e)} className="space-y-4 p-4 pt-0">
        <Field label="Business instructions" htmlFor="ins" hint="Tone, language and anything the assistant should always mention. It cannot override the safety rules.">
          <Textarea id="ins" rows={5} maxLength={2000} value={ins} onChange={(e) => setInstructions(e.target.value)} disabled={!canEdit} placeholder="Reply in a friendly, concise tone. Sign off with the shop name." />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={auto} disabled={!canEdit} onChange={(e) => setAutoReply(e.target.checked)} />
          <span>
            <span className="font-medium text-ink">Let the AI answer customers on the storefront</span>
            <span className="block text-muted">Replies use only knowledge documents marked public and your active products, are labeled as AI, and never discuss orders or payments. Off by default.</span>
          </span>
        </label>
        <p className="text-xs text-muted">Provider status: {settings.configured ? 'connected' : 'not connected'}. The assistant has no tools, so it cannot send transactions or edit anything. See <Link to="../knowledge" className="underline">Knowledge base</Link> for what it can use.</p>
        {canEdit && <Button type="submit" loading={busy}>Save settings</Button>}
      </form>
    </Card>
  )
}
