import { aiConfigured, chat } from './ai'
import { loadSettings, statsText, systemPrompt } from './assistant'
import { rows, sql } from './db'
import { badRequest, safeMessage } from './http'
import { businessStats, retrieve } from './knowledge'
import { big, usd } from './money'
import { nextNumber, publicId } from './ordering'

/**
 * Workflow automation. SAFETY BY CONSTRUCTION: the only node types that exist are the ones listed below.
 * There is no node that sends a transaction, signs, approves, refunds or marks an order paid, so no
 * workflow (and no AI step inside one) can move funds or confirm a payment. Payment status changes only
 * through server-side onchain verification.
 */
export const TRIGGERS = ['manual', 'order.created', 'payment.verified', 'order.status_changed', 'support.message', 'schedule.daily'] as const
export type Trigger = (typeof TRIGGERS)[number]
export const ACTION_TYPES = ['notify', 'update_order_status', 'create_invoice', 'ai_draft', 'tag_conversation'] as const
export type ActionType = (typeof ACTION_TYPES)[number]
export const FIELDS = ['order.status', 'order.paymentStatus', 'order.total', 'order.customerName', 'conversation.subject', 'conversation.lastMessage'] as const
export const OPS = ['eq', 'neq', 'gt', 'lt', 'contains'] as const
export const SETTABLE_ORDER_STATUSES = ['processing', 'fulfilled'] as const

export interface WfNode {
  id: string
  type: 'trigger' | 'condition' | ActionType
  x: number
  y: number
  config: Record<string, string>
}
export interface WfEdge {
  from: string
  to: string
  branch?: 'true' | 'false'
}
export interface Graph {
  nodes: WfNode[]
  edges: WfEdge[]
}

const ORDER_TRIGGERS: readonly Trigger[] = ['order.created', 'payment.verified', 'order.status_changed', 'manual']
const CONVERSATION_TRIGGERS: readonly Trigger[] = ['support.message', 'manual']

// ---------- validation ----------
export function validateGraph(trigger: Trigger, raw: unknown): Graph {
  if (!raw || typeof raw !== 'object') throw badRequest('The workflow graph is invalid.')
  const g = raw as { nodes?: unknown; edges?: unknown }
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw badRequest('The workflow graph is invalid.')
  if (g.nodes.length > 30 || g.edges.length > 60) throw badRequest('A workflow can have up to 30 steps.')
  const nodes: WfNode[] = []
  const ids = new Set<string>()
  for (const n of g.nodes as Record<string, unknown>[]) {
    const id = String(n.id ?? '')
    if (!/^[a-z0-9_-]{1,24}$/.test(id) || ids.has(id)) throw badRequest('Every step needs a unique id.')
    ids.add(id)
    const type = String(n.type ?? '')
    if (type !== 'trigger' && type !== 'condition' && !(ACTION_TYPES as readonly string[]).includes(type)) throw badRequest(`Unknown step type "${type.slice(0, 30)}". Workflows cannot move funds or confirm payments.`)
    const cfgRaw = (n.config && typeof n.config === 'object' ? n.config : {}) as Record<string, unknown>
    const config: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfgRaw)) {
      if (typeof v !== 'string' || v.length > 800 || !/^[a-zA-Z]{1,24}$/.test(k)) throw badRequest('A step setting is invalid.')
      config[k] = v
    }
    const x = Math.min(4000, Math.max(0, Number(n.x) || 0))
    const y = Math.min(4000, Math.max(0, Number(n.y) || 0))
    nodes.push({ id, type: type as WfNode['type'], x, y, config })
  }
  const triggers = nodes.filter((n) => n.type === 'trigger')
  if (triggers.length !== 1) throw badRequest('A workflow needs exactly one trigger step.')

  for (const n of nodes) {
    const c = n.config
    if (n.type === 'condition') {
      if (!(FIELDS as readonly string[]).includes(c.field ?? '')) throw badRequest('Choose a field for the condition.')
      if (!(OPS as readonly string[]).includes(c.op ?? '')) throw badRequest('Choose an operator for the condition.')
      if ((c.value ?? '') === '') throw badRequest('Enter a value for the condition.')
      const needsOrder = (c.field ?? '').startsWith('order.')
      if (needsOrder && !ORDER_TRIGGERS.includes(trigger)) throw badRequest('Order fields only work with order triggers.')
      if (!needsOrder && !CONVERSATION_TRIGGERS.includes(trigger)) throw badRequest('Conversation fields only work with the support message trigger.')
    }
    if (n.type === 'notify' && (c.title ?? '').trim().length < 2) throw badRequest('A notification needs a title.')
    if (n.type === 'update_order_status') {
      if (!(SETTABLE_ORDER_STATUSES as readonly string[]).includes(c.status ?? '')) throw badRequest('Workflows may only set orders to processing or fulfilled.')
      if (!ORDER_TRIGGERS.includes(trigger)) throw badRequest('Updating an order needs an order trigger.')
    }
    if (n.type === 'create_invoice' && !ORDER_TRIGGERS.includes(trigger)) throw badRequest('Creating an invoice needs an order trigger.')
    if (n.type === 'tag_conversation') {
      if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(c.tag ?? '')) throw badRequest('Tags use lowercase letters, numbers and dashes.')
      if (!CONVERSATION_TRIGGERS.includes(trigger)) throw badRequest('Tagging needs the support message trigger.')
    }
    if (n.type === 'ai_draft') {
      const mode = c.mode ?? 'text'
      if (mode !== 'text' && mode !== 'daily_summary') throw badRequest('Unknown AI mode.')
      if (mode === 'text' && (c.prompt ?? '').trim().length < 5) throw badRequest('Describe what the AI should write.')
      const target = c.target ?? 'notification'
      if (target !== 'note' && target !== 'notification') throw badRequest('Unknown AI output target.')
      if (target === 'note' && !CONVERSATION_TRIGGERS.includes(trigger)) throw badRequest('Saving as a conversation note needs the support message trigger.')
    }
  }

  const edges: WfEdge[] = []
  const out = new Map<string, number>()
  for (const e of g.edges as Record<string, unknown>[]) {
    const from = String(e.from ?? '')
    const to = String(e.to ?? '')
    if (!ids.has(from) || !ids.has(to) || from === to) throw badRequest('A connection points to a missing step.')
    const target = nodes.find((n) => n.id === to)!
    if (target.type === 'trigger') throw badRequest('Nothing can connect into the trigger.')
    const source = nodes.find((n) => n.id === from)!
    let branch: 'true' | 'false' | undefined
    if (source.type === 'condition') {
      if (e.branch !== 'true' && e.branch !== 'false') throw badRequest('Condition connections must be true or false.')
      branch = e.branch
    }
    out.set(from, (out.get(from) ?? 0) + 1)
    edges.push(branch ? { from, to, branch } : { from, to })
  }
  for (const n of out.values()) if (n > 3) throw badRequest('A step can connect to at most 3 others.')
  // acyclic
  const adj = new Map<string, string[]>()
  for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return false
    if (state.get(id) === 2) return true
    state.set(id, 1)
    for (const nx of adj.get(id) ?? []) if (!visit(nx)) return false
    state.set(id, 2)
    return true
  }
  for (const n of nodes) if (!visit(n.id)) throw badRequest('Connections cannot form a loop.')
  return { nodes, edges }
}

// ---------- context and templates ----------
/** orderStatus is the status at the moment of the event, so a run reflects what happened, not what the order became later. */
export interface EventPayload {
  orderId?: string
  conversationId?: string
  orderStatus?: string
}

interface RunContext {
  workspaceId: string
  workspaceName: string
  workflowName: string
  orderId?: string
  conversationId?: string
  values: Record<string, string>
}

async function buildContext(workspaceId: string, workflowName: string, payload: EventPayload): Promise<RunContext> {
  const w = await rows<{ name: string }>(sql`SELECT name FROM workspaces WHERE id = ${workspaceId}`)
  const ctx: RunContext = { workspaceId, workspaceName: w[0]?.name ?? '', workflowName, values: { 'business.name': w[0]?.name ?? '' } }
  if (payload.orderId) {
    const o = await rows<{ id: string; number: unknown; status: string; payment_status: string; total_units: unknown; customer_name: string }>(sql`
      SELECT id, number, status, payment_status, total_units, customer_name FROM orders WHERE id = ${payload.orderId} AND workspace_id = ${workspaceId}`)
    if (o[0]) {
      ctx.orderId = o[0].id
      Object.assign(ctx.values, {
        'order.number': String(big(o[0].number)),
        'order.status': payload.orderStatus ?? o[0].status,
        'order.paymentStatus': o[0].payment_status,
        'order.total': usd(o[0].total_units),
        'order.customerName': o[0].customer_name,
      })
    }
  }
  if (payload.conversationId) {
    const c = await rows<{ id: string; subject: string; customer_name: string }>(sql`
      SELECT id, subject, customer_name FROM support_conversations WHERE id = ${payload.conversationId} AND workspace_id = ${workspaceId}`)
    if (c[0]) {
      const last = await rows<{ body: string }>(sql`SELECT body FROM support_messages WHERE conversation_id = ${c[0].id} AND sender = 'customer' ORDER BY created_at DESC LIMIT 1`)
      ctx.conversationId = c[0].id
      Object.assign(ctx.values, { 'conversation.subject': c[0].subject, 'conversation.customerName': c[0].customer_name, 'conversation.lastMessage': last[0]?.body ?? '' })
    }
  }
  return ctx
}

const render = (tpl: string, c: RunContext): string => tpl.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_m, k: string) => c.values[k] ?? '')

function evaluate(c: RunContext, cfg: Record<string, string>): boolean {
  const actual = c.values[cfg.field ?? ''] ?? ''
  const expected = cfg.value ?? ''
  switch (cfg.op) {
    case 'eq':
      return actual.toLowerCase() === expected.toLowerCase()
    case 'neq':
      return actual.toLowerCase() !== expected.toLowerCase()
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase())
    case 'gt':
      return Number.parseFloat(actual) > Number.parseFloat(expected)
    case 'lt':
      return Number.parseFloat(actual) < Number.parseFloat(expected)
    default:
      return false
  }
}

export async function notify(workspaceId: string, kind: string, title: string, body = '', link: string | null = null) {
  await sql`INSERT INTO notifications (workspace_id, kind, title, body, link) VALUES (${workspaceId}, ${kind}, ${title.slice(0, 160)}, ${body.slice(0, 2000)}, ${link})`
}

// ---------- actions ----------
interface StepResult {
  status: 'ok' | 'skipped'
  output: string
}

async function runAction(node: WfNode, c: RunContext): Promise<StepResult> {
  const cfg = node.config
  switch (node.type) {
    case 'notify': {
      const link = c.orderId ? `/app/${c.workspaceId}/orders/${c.orderId}` : c.conversationId ? `/app/${c.workspaceId}/inbox/${c.conversationId}` : null
      await notify(c.workspaceId, 'workflow', render(cfg.title ?? '', c), render(cfg.body ?? '', c), link)
      return { status: 'ok', output: 'Notification created' }
    }
    case 'update_order_status': {
      if (!c.orderId) return { status: 'skipped', output: 'No order in this run' }
      const to = cfg.status as (typeof SETTABLE_ORDER_STATUSES)[number]
      const from = to === 'processing' ? ['pending'] : ['processing']
      const r = await rows<{ id: string }>(sql`
        UPDATE orders SET status = ${to}, updated_at = now() WHERE id = ${c.orderId} AND workspace_id = ${c.workspaceId} AND status = ANY(${sql.array(from, 'TEXT')}::text[]) RETURNING id`)
      if (!r[0]) return { status: 'skipped', output: `Order is not in a state that can move to ${to}` }
      await sql`INSERT INTO order_events (order_id, kind, detail) VALUES (${c.orderId}, 'status', ${`${from[0]} to ${to} (workflow: ${c.workflowName})`})`
      return { status: 'ok', output: `Order set to ${to}` }
    }
    case 'create_invoice': {
      if (!c.orderId) return { status: 'skipped', output: 'No order in this run' }
      const o = await rows<{ status: string; total_units: unknown }>(sql`SELECT status, total_units FROM orders WHERE id = ${c.orderId} AND workspace_id = ${c.workspaceId}`)
      if (!o[0] || o[0].status === 'cancelled') return { status: 'skipped', output: 'Order cannot be invoiced' }
      const existing = await rows<{ id: string }>(sql`SELECT id FROM invoices WHERE order_id = ${c.orderId}`)
      if (existing[0]) return { status: 'skipped', output: 'Invoice already exists' }
      const number = await sql.begin(async (tx) => {
        const n = await nextNumber(tx, c.workspaceId, 'invoice')
        const label = `INV-${n.toString().padStart(6, '0')}`
        const r = await rows<{ id: string }>(tx`
          INSERT INTO invoices (workspace_id, order_id, public_id, number, amount_units, due_at)
          VALUES (${c.workspaceId}, ${c.orderId!}, ${publicId()}, ${label}, ${String(big(o[0]!.total_units))}, now() + interval '14 days')
          ON CONFLICT (order_id) DO NOTHING RETURNING id`)
        if (r[0]) await tx`INSERT INTO order_events (order_id, kind, detail) VALUES (${c.orderId!}, 'invoice', ${`Invoice ${label} issued (workflow: ${c.workflowName})`})`
        return r[0] ? label : null
      })
      return number ? { status: 'ok', output: `Invoice ${number} issued` } : { status: 'skipped', output: 'Invoice already exists' }
    }
    case 'tag_conversation': {
      if (!c.conversationId) return { status: 'skipped', output: 'No conversation in this run' }
      await sql`UPDATE support_conversations SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(tags || ${sql.array([cfg.tag ?? ''], 'TEXT')}::text[]) AS t), updated_at = now() WHERE id = ${c.conversationId} AND workspace_id = ${c.workspaceId}`
      return { status: 'ok', output: `Tagged ${cfg.tag}` }
    }
    case 'ai_draft': {
      if (!aiConfigured()) throw new Error('AI is not configured. Add AI_API_KEY and AI_MODEL to .env.')
      const settings = await loadSettings(c.workspaceId)
      let userContent: string
      let task: string
      if ((cfg.mode ?? 'text') === 'daily_summary') {
        const stats = await businessStats(c.workspaceId, 'owner', 1)
        task = 'Task: write a short plain-language summary (under 120 words) of the last day from CONTEXT. Quote figures exactly and add no numbers of your own.'
        userContent = `CONTEXT\n${statsText(stats)}`
      } else {
        task = `Task: ${render(cfg.prompt ?? '', c).slice(0, 600)}\nWrite for a human to review. Use only CONTEXT.`
        const found = c.conversationId ? await retrieve(c.workspaceId, `${c.values['conversation.subject'] ?? ''} ${c.values['conversation.lastMessage'] ?? ''}`, { publicOnly: false }) : null
        userContent = `CONTEXT\n${Object.entries(c.values).map(([k, v]) => `${k}: ${v}`).join('\n')}${found?.context ? `\n\n${found.context}` : ''}`
      }
      const text = await chat([{ role: 'system', content: systemPrompt(c.workspaceName, settings.instructions, task) }, { role: 'user', content: userContent }], { maxTokens: 350 })
      if ((cfg.target ?? 'notification') === 'note' && c.conversationId) {
        await sql`INSERT INTO support_notes (conversation_id, body, ai_generated) VALUES (${c.conversationId}, ${text}, true)`
        return { status: 'ok', output: 'AI draft saved as an internal note' }
      }
      await notify(c.workspaceId, 'ai', `AI draft: ${c.workflowName}`, text)
      return { status: 'ok', output: 'AI draft sent as a notification' }
    }
    default:
      return { status: 'skipped', output: 'Unsupported step' }
  }
}

// ---------- execution ----------
interface WorkflowRow {
  id: string
  workspace_id: string
  name: string
  enabled: boolean
  trigger: Trigger
  graph: Graph
}
interface StepLog {
  nodeId: string
  type: string
  status: 'ok' | 'skipped' | 'failed'
  output: string
}

export async function runWorkflow(wf: WorkflowRow, source: 'manual' | 'event' | 'schedule', payload: EventPayload, startedBy: string | null = null) {
  const created = await rows<{ id: string }>(sql`
    INSERT INTO workflow_runs (workflow_id, workspace_id, source, payload, started_by)
    VALUES (${wf.id}, ${wf.workspace_id}, ${source}, ${JSON.stringify(payload)}::text::jsonb, ${startedBy}) RETURNING id`)
  const runId = created[0]!.id
  const steps: StepLog[] = []
  let error: string | null = null
  try {
    const ctx = await buildContext(wf.workspace_id, wf.name, payload)
    const byId = new Map(wf.graph.nodes.map((n) => [n.id, n]))
    const start = wf.graph.nodes.find((n) => n.type === 'trigger')
    if (!start) throw new Error('This workflow has no trigger.')
    const queue = [start.id]
    const seen = new Set<string>()
    while (queue.length > 0 && steps.length < 30) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = byId.get(id)!
      let branch: 'true' | 'false' | null = null
      if (node.type === 'trigger') steps.push({ nodeId: id, type: 'trigger', status: 'ok', output: `Started by ${wf.trigger}` })
      else if (node.type === 'condition') {
        const result = evaluate(ctx, node.config)
        branch = result ? 'true' : 'false'
        steps.push({ nodeId: id, type: 'condition', status: 'ok', output: `Condition is ${branch}` })
      } else {
        try {
          const r = await runAction(node, ctx)
          steps.push({ nodeId: id, type: node.type, status: r.status, output: r.output })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Step failed'
          steps.push({ nodeId: id, type: node.type, status: 'failed', output: msg })
          throw new Error(`Step "${node.type}" failed: ${msg}`)
        }
      }
      for (const e of wf.graph.edges) if (e.from === id && (branch === null || e.branch === branch)) queue.push(e.to)
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 500) : 'Workflow failed'
  }
  await sql`UPDATE workflow_runs SET status = ${error ? 'failed' : 'succeeded'}, steps = ${JSON.stringify(steps)}::text::jsonb, error = ${error}, finished_at = now() WHERE id = ${runId}`
  return { id: runId, status: error ? 'failed' : 'succeeded', steps, error }
}

/** Fire-and-forget: matching enabled workflows run in the background. Errors are recorded on the run. */
export function emitEvent(workspaceId: string, trigger: Trigger, payload: EventPayload): void {
  void (async () => {
    try {
      const list = await rows<WorkflowRow>(sql`SELECT id, workspace_id, name, enabled, trigger, graph FROM workflows WHERE workspace_id = ${workspaceId} AND trigger = ${trigger} AND enabled`)
      for (const wf of list) await runWorkflow(wf, 'event', payload)
    } catch (e) {
      console.error('workflow event failed', safeMessage(e))
    }
  })()
}

/** Runs each enabled daily workflow once per 24 hours. Called by a timer in the API server. */
export async function runDueSchedules(): Promise<number> {
  const due = await rows<WorkflowRow>(sql`
    SELECT w.id, w.workspace_id, w.name, w.enabled, w.trigger, w.graph FROM workflows w
    WHERE w.enabled AND w.trigger = 'schedule.daily'
      AND NOT EXISTS (SELECT 1 FROM workflow_runs r WHERE r.workflow_id = w.id AND r.source = 'schedule' AND r.started_at > now() - interval '24 hours')
    LIMIT 25`)
  for (const wf of due) await runWorkflow(wf, 'schedule', {})
  return due.length
}
