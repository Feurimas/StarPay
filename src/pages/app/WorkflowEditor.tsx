import { ArrowLeft, Play, Save, Trash2, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { AiLabel } from '@/components/ai'
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useApi } from '@/lib/useApi'
import { TRIGGER_LABELS } from '@/pages/app/Workflows'

type NodeType = 'trigger' | 'condition' | 'notify' | 'update_order_status' | 'create_invoice' | 'ai_draft' | 'tag_conversation'
interface WfNode { id: string; type: NodeType; x: number; y: number; config: Record<string, string> }
interface WfEdge { from: string; to: string; branch?: 'true' | 'false' }
interface Graph { nodes: WfNode[]; edges: WfEdge[] }
interface Step { nodeId: string; type: string; status: 'ok' | 'skipped' | 'failed'; output: string }
interface Run { id: string; source: string; status: string; steps: Step[]; error: string | null; startedAt: string }
interface WorkflowData { workflow: { id: string; name: string; enabled: boolean; trigger: string; graph: Graph }; runs: Run[] }

const NODE_W = 208
const NODE_H = 68
const LABELS: Record<NodeType, string> = {
  trigger: 'Trigger',
  condition: 'Condition',
  notify: 'Notify the team',
  update_order_status: 'Update order status',
  create_invoice: 'Create invoice',
  ai_draft: 'AI draft (for review)',
  tag_conversation: 'Tag conversation',
}
const TOOLBOX: NodeType[] = ['condition', 'notify', 'update_order_status', 'create_invoice', 'ai_draft', 'tag_conversation']
const DEFAULTS: Partial<Record<NodeType, Record<string, string>>> = {
  condition: { field: 'order.status', op: 'eq', value: '' },
  notify: { title: '', body: '' },
  update_order_status: { status: 'processing' },
  ai_draft: { mode: 'text', target: 'notification', prompt: '' },
  tag_conversation: { tag: '' },
}
const FIELD_OPTIONS = ['order.status', 'order.paymentStatus', 'order.total', 'order.customerName', 'conversation.subject', 'conversation.lastMessage']

export default function WorkflowEditor() {
  const { workspace } = useWorkspace()
  const { fid } = useParams()
  const base = `/workspaces/${workspace.id}/workflows/${fid}`
  const { data, error, reload } = useApi<WorkflowData>(base)
  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <Spinner />
  return <Editor key={`${data.workflow.id}`} data={data} base={base} reload={reload} />
}

function Editor({ data, base, reload }: { data: WorkflowData; base: string; reload: () => void }) {
  const { workspace, can } = useWorkspace()
  const manage = can('workflows.manage')
  const [name, setName] = useState(data.workflow.name)
  const [trigger, setTrigger] = useState(data.workflow.trigger)
  const [graph, setGraph] = useState<Graph>(data.workflow.graph)
  const [enabled, setEnabled] = useState(data.workflow.enabled)
  const [selected, setSelected] = useState<string | null>(null)
  const [linking, setLinking] = useState<{ from: string; branch?: 'true' | 'false' } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  const edit = (g: Graph) => {
    setGraph(g)
    setDirty(true)
  }
  const sel = graph.nodes.find((n) => n.id === selected) ?? null
  const patchNode = (id: string, patch: Partial<WfNode>) => edit({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  const patchConfig = (id: string, key: string, value: string) => {
    const n = graph.nodes.find((x) => x.id === id)
    if (n) patchNode(id, { config: { ...n.config, [key]: value } })
  }

  const addNode = (type: NodeType) => {
    const id = `n${Date.now().toString(36)}`.slice(0, 20)
    const y = 40 + (graph.nodes.length % 5) * 90
    edit({ ...graph, nodes: [...graph.nodes, { id, type, x: 300 + (graph.nodes.length % 3) * 40, y, config: { ...(DEFAULTS[type] ?? {}) } }] })
    setSelected(id)
  }
  const removeNode = (id: string) => {
    edit({ nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.from !== id && e.to !== id) })
    setSelected(null)
  }
  const connectTo = (to: string) => {
    if (!linking || linking.from === to) return setLinking(null)
    const rest = graph.edges.filter((e) => !(e.from === linking.from && e.branch === linking.branch))
    edit({ ...graph, edges: [...rest, linking.branch ? { from: linking.from, to, branch: linking.branch } : { from: linking.from, to }] })
    setLinking(null)
  }

  const onDown = (e: PointerEvent, n: WfNode) => {
    if (!manage) return
    setSelected(n.id)
    drag.current = { id: n.id, dx: e.clientX - n.x, dy: e.clientY - n.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const x = Math.max(0, Math.min(1200, e.clientX - d.dx))
    const y = Math.max(0, Math.min(640, e.clientY - d.dy))
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) }))
    setDirty(true)
  }

  const out = (n: WfNode, branch?: 'true' | 'false') => ({ x: n.x + NODE_W, y: n.y + (n.type === 'condition' ? (branch === 'false' ? 50 : 20) : NODE_H / 2) })
  const inn = (n: WfNode) => ({ x: n.x, y: n.y + NODE_H / 2 })

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api.put<{ enabled: boolean }>(base, { name, trigger, graph })
      setEnabled(r.enabled)
      setDirty(false)
      toast.success('Workflow saved')
      reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const toggle = async () => {
    try {
      await api.post(`${base}/enabled`, { enabled: !enabled })
      setEnabled(!enabled)
      toast.success(!enabled ? 'Workflow enabled' : 'Workflow disabled')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const needsOrder = graph.nodes.some((n) => ['update_order_status', 'create_invoice'].includes(n.type) || n.config.field?.startsWith('order.')) || trigger.startsWith('order.') || trigger === 'payment.verified'
  const needsConv = trigger === 'support.message' || graph.nodes.some((n) => n.type === 'tag_conversation')

  return (
    <div>
      <Link to={`/app/${workspace.id}/workflows`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All workflows</Link>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1"><Field label="Name" htmlFor="wfname"><Input id="wfname" value={name} disabled={!manage} onChange={(e) => { setName(e.target.value); setDirty(true) }} /></Field></div>
        <div className="min-w-[220px]">
          <Field label="Starts when" htmlFor="wftrig">
            <Select id="wftrig" value={trigger} disabled={!manage} onChange={(e) => { setTrigger(e.target.value); setDirty(true) }}>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
        {manage && <Button variant="secondary" onClick={() => void toggle()} disabled={dirty}>{enabled ? 'Disable' : 'Enable'}</Button>}
        {manage && <Button onClick={() => void save()} loading={busy} disabled={!dirty}><Save className="h-4 w-4" /> Save</Button>}
      </div>
      {dirty && manage && <p className="mb-2 text-xs text-amber-700">Unsaved changes. Save before enabling or testing.</p>}
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {linking && <div className="mb-3"><Alert tone="info">Click the left dot of the step to connect to. <button className="underline" onClick={() => setLinking(null)}>Cancel</button></Alert></div>}

      <div className="grid gap-4 xl:grid-cols-[170px_minmax(0,1fr)_280px]">
        <Card className="p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Add a step</p>
          <div className="space-y-1.5">
            {TOOLBOX.map((t) => <button key={t} disabled={!manage} onClick={() => addNode(t)} className="w-full rounded-lg border border-line px-2.5 py-2 text-left text-sm text-ink hover:border-brand disabled:opacity-50">{LABELS[t]}</button>)}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted">There is no step that sends or approves a payment. Payments are confirmed only by onchain verification.</p>
        </Card>

        <div className="overflow-auto rounded-2xl border border-line bg-white" onClick={() => { setSelected(null); setLinking(null) }}>
          <div ref={canvas} className="relative h-[640px] w-[1300px] bg-[radial-gradient(circle,#e5e7f0_1px,transparent_1px)] [background-size:20px_20px]" onPointerMove={onMove} onPointerUp={() => { drag.current = null }}>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {graph.edges.map((e) => {
                const a = graph.nodes.find((n) => n.id === e.from)
                const b = graph.nodes.find((n) => n.id === e.to)
                if (!a || !b) return null
                const p = out(a, e.branch)
                const q = inn(b)
                const mx = (p.x + q.x) / 2
                return <path key={`${e.from}-${e.to}-${e.branch ?? ''}`} d={`M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`} fill="none" stroke={e.branch === 'false' ? '#ef4444' : e.branch === 'true' ? '#10b981' : '#6366f1'} strokeWidth={2} />
              })}
            </svg>
            {manage && graph.edges.map((e) => {
              const a = graph.nodes.find((n) => n.id === e.from)
              const b = graph.nodes.find((n) => n.id === e.to)
              if (!a || !b) return null
              const p = out(a, e.branch)
              const q = inn(b)
              return <button key={`x-${e.from}-${e.to}-${e.branch ?? ''}`} aria-label="Remove connection" onClick={(ev) => { ev.stopPropagation(); edit({ ...graph, edges: graph.edges.filter((x) => x !== e) }) }} className="absolute flex h-4 w-4 items-center justify-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-red-600" style={{ left: (p.x + q.x) / 2 - 8, top: (p.y + q.y) / 2 - 8 }}><X className="h-2.5 w-2.5" /></button>
            })}
            {graph.nodes.map((n) => (
              <div key={n.id} onClick={(e) => e.stopPropagation()} className={`absolute rounded-xl border bg-white shadow-sm ${selected === n.id ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`} style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}>
                {n.type !== 'trigger' && <button aria-label={`Connect into ${LABELS[n.type]}`} onClick={() => connectTo(n.id)} className={`absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-line ${linking ? 'bg-brand' : 'bg-slate-300'}`} />}
                <div onPointerDown={(e) => onDown(e, n)} className={`flex h-full cursor-grab touch-none flex-col justify-center px-3 ${n.type === 'trigger' ? 'rounded-xl bg-ink text-white' : ''}`}>
                  <p className="text-[10px] uppercase tracking-wide opacity-60">{n.type === 'trigger' ? 'When' : n.type === 'condition' ? 'If' : 'Then'}</p>
                  <p className="truncate text-sm font-medium">{n.type === 'trigger' ? TRIGGER_LABELS[trigger] : LABELS[n.type]}</p>
                  <p className="truncate text-[11px] opacity-70">{summary(n)}</p>
                </div>
                {n.type === 'condition' ? (
                  <>
                    <OutHandle label="Yes" color="bg-emerald-500" top={20} onClick={() => manage && setLinking({ from: n.id, branch: 'true' })} />
                    <OutHandle label="No" color="bg-red-500" top={50} onClick={() => manage && setLinking({ from: n.id, branch: 'false' })} />
                  </>
                ) : <OutHandle label="Next" color="bg-ink" top={NODE_H / 2} onClick={() => manage && setLinking({ from: n.id })} />}
              </div>
            ))}
          </div>
        </div>

        <Card className="p-4">
          {!sel && <p className="text-sm text-muted">Select a step to edit it. Drag steps to move them. Click a right-hand dot, then the left dot of the next step, to connect.</p>}
          {sel && <StepForm node={sel} manage={manage} onConfig={(k, v) => patchConfig(sel.id, k, v)} onDelete={() => removeNode(sel.id)} />}
        </Card>
      </div>

      <RunPanel base={base} data={data} reload={reload} needsOrder={needsOrder} needsConv={needsConv} dirty={dirty} canRun={can('workflows.run')} workspaceId={workspace.id} />
    </div>
  )
}

function OutHandle({ label, color, top, onClick }: { label: string; color: string; top: number; onClick: () => void }) {
  return <button aria-label={`Connect from ${label}`} title={label} onClick={onClick} className={`absolute -right-2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-line ${color}`} style={{ top }} />
}

function summary(n: WfNode): string {
  const c = n.config
  if (n.type === 'condition') return `${c.field ?? ''} ${c.op ?? ''} ${c.value ?? ''}`
  if (n.type === 'notify') return c.title || 'Add a title'
  if (n.type === 'update_order_status') return `Set to ${c.status}`
  if (n.type === 'ai_draft') return c.mode === 'daily_summary' ? 'Daily summary' : c.prompt || 'Add instructions'
  if (n.type === 'tag_conversation') return c.tag || 'Add a tag'
  return ''
}

function StepForm({ node, manage, onConfig, onDelete }: { node: WfNode; manage: boolean; onConfig: (k: string, v: string) => void; onDelete: () => void }) {
  const c = node.config
  const dis = !manage
  return (
    <div className="space-y-3">
      <CardHeader title={LABELS[node.type]} />
      {node.type === 'trigger' && <p className="text-sm text-muted">Change when this workflow starts with the selector above the canvas.</p>}
      {node.type === 'condition' && (
        <>
          <Field label="Field" htmlFor="cf"><Select id="cf" disabled={dis} value={c.field} onChange={(e) => onConfig('field', e.target.value)}>{FIELD_OPTIONS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <Field label="Operator" htmlFor="co"><Select id="co" disabled={dis} value={c.op} onChange={(e) => onConfig('op', e.target.value)}><option value="eq">equals</option><option value="neq">does not equal</option><option value="contains">contains</option><option value="gt">greater than</option><option value="lt">less than</option></Select></Field>
          <Field label="Value" htmlFor="cv"><Input id="cv" disabled={dis} value={c.value ?? ''} onChange={(e) => onConfig('value', e.target.value)} /></Field>
          <p className="text-xs text-muted">Connect the green dot for when it is true and the red dot for when it is false.</p>
        </>
      )}
      {node.type === 'notify' && (
        <>
          <Field label="Title" htmlFor="nt" hint="Placeholders: {{order.number}}, {{order.total}}, {{order.customerName}}, {{conversation.subject}}"><Input id="nt" disabled={dis} value={c.title ?? ''} onChange={(e) => onConfig('title', e.target.value)} maxLength={160} /></Field>
          <Field label="Message" htmlFor="nb"><Textarea id="nb" rows={3} disabled={dis} value={c.body ?? ''} onChange={(e) => onConfig('body', e.target.value)} maxLength={500} /></Field>
        </>
      )}
      {node.type === 'update_order_status' && (
        <Field label="Set the order to" htmlFor="us" hint="Only processing or fulfilled. Workflows can never mark an order paid or cancel it."><Select id="us" disabled={dis} value={c.status} onChange={(e) => onConfig('status', e.target.value)}><option value="processing">Processing</option><option value="fulfilled">Fulfilled</option></Select></Field>
      )}
      {node.type === 'create_invoice' && <p className="text-sm text-muted">Issues an invoice for the order if it does not have one. Nothing is charged.</p>}
      {node.type === 'tag_conversation' && <Field label="Tag" htmlFor="tg"><Input id="tg" disabled={dis} value={c.tag ?? ''} onChange={(e) => onConfig('tag', e.target.value.toLowerCase())} maxLength={24} /></Field>}
      {node.type === 'ai_draft' && (
        <>
          <AiLabel />
          <Field label="What to write" htmlFor="am"><Select id="am" disabled={dis} value={c.mode} onChange={(e) => onConfig('mode', e.target.value)}><option value="text">Custom instructions</option><option value="daily_summary">Daily business summary</option></Select></Field>
          {c.mode !== 'daily_summary' && <Field label="Instructions" htmlFor="ap"><Textarea id="ap" rows={4} disabled={dis} value={c.prompt ?? ''} onChange={(e) => onConfig('prompt', e.target.value)} maxLength={600} /></Field>}
          <Field label="Save the result as" htmlFor="at"><Select id="at" disabled={dis} value={c.target} onChange={(e) => onConfig('target', e.target.value)}><option value="notification">A notification</option><option value="note">An internal conversation note</option></Select></Field>
          <p className="text-xs text-muted">The AI only drafts text for a person to read. It cannot send anything to customers or change records. Needs the AI provider to be connected.</p>
        </>
      )}
      {manage && node.type !== 'trigger' && <Button variant="secondary" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Remove step</Button>}
    </div>
  )
}

function RunPanel({ base, data, reload, needsOrder, needsConv, dirty, canRun, workspaceId }: { base: string; data: WorkflowData; reload: () => void; needsOrder: boolean; needsConv: boolean; dirty: boolean; canRun: boolean; workspaceId: string }) {
  const { prefs } = useWorkspace()
  const orders = useApi<{ orders: { id: string; number: number; customerName: string }[] }>(needsOrder ? `/workspaces/${workspaceId}/orders` : null)
  const convs = useApi<{ conversations: { id: string; subject: string }[] }>(needsConv ? `/workspaces/${workspaceId}/support?status=all` : null)
  const [orderId, setOrderId] = useState('')
  const [convId, setConvId] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await api.post<{ run: { status: string; error: string | null } }>(`${base}/run`, { orderId: orderId || undefined, conversationId: convId || undefined })
      if (r.run.status === 'failed') toast.error(r.run.error ?? 'The run failed')
      else toast.success('Run finished')
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mt-4">
      <CardHeader title="Test and history" description="Manual runs use real records from this workspace and take the same actions as an automatic run." />
      <div className="space-y-4 p-4 pt-0">
        {canRun && (
          <div className="flex flex-wrap items-end gap-3">
            {needsOrder && <Field label="Order" htmlFor="ro"><Select id="ro" value={orderId} onChange={(e) => setOrderId(e.target.value)}><option value="">Choose an order</option>{orders.data?.orders.map((o) => <option key={o.id} value={o.id}>#{o.number} {o.customerName}</option>)}</Select></Field>}
            {needsConv && <Field label="Conversation" htmlFor="rc"><Select id="rc" value={convId} onChange={(e) => setConvId(e.target.value)}><option value="">Choose a conversation</option>{convs.data?.conversations.map((c) => <option key={c.id} value={c.id}>{c.subject}</option>)}</Select></Field>}
            <Button onClick={() => void run()} loading={busy} disabled={dirty || (needsOrder && !orderId && !needsConv) || (needsConv && !convId && !needsOrder)}><Play className="h-4 w-4" /> Run now</Button>
            {dirty && <span className="text-xs text-amber-700">Save your changes first.</span>}
          </div>
        )}
        {data.runs.length === 0 && <p className="text-sm text-muted">No runs yet.</p>}
        <ul className="space-y-2">
          {data.runs.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'}>{r.status}</Badge>
                <span className="text-muted">{r.source} · {formatDate(r.startedAt, prefs, true)}</span>
              </div>
              {r.error && <p className="mt-1 text-sm text-red-600">{r.error}</p>}
              <ol className="mt-2 space-y-0.5 text-xs text-muted">
                {r.steps.map((s, i) => <li key={i}><span className={s.status === 'failed' ? 'text-red-600' : s.status === 'skipped' ? 'text-amber-700' : 'text-emerald-700'}>{s.status}</span> · {s.type}: {s.output}</li>)}
              </ol>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
