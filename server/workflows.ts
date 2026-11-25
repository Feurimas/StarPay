import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, bool, isUuid, notFound, oneOf, rateLimit, str } from './http'
import { ACTION_TYPES, runWorkflow, TRIGGERS, validateGraph, type Graph, type Trigger } from './workflowEngine'

interface WfRow {
  id: string
  workspace_id: string
  name: string
  enabled: boolean
  trigger: Trigger
  graph: Graph
  created_at: string
  updated_at: string
}

const wfDto = (w: WfRow & { last_status?: string | null; last_run_at?: string | null }) => ({
  id: w.id,
  name: w.name,
  enabled: w.enabled,
  trigger: w.trigger,
  graph: w.graph,
  lastRunStatus: w.last_status ?? null,
  lastRunAt: w.last_run_at ?? null,
  updatedAt: w.updated_at,
})

const node = (id: string, type: string, x: number, y: number, config: Record<string, string> = {}) => ({ id, type, x, y, config })

export const TEMPLATES: { id: string; name: string; description: string; trigger: Trigger; graph: Graph }[] = [
  {
    id: 'new-order-notify',
    name: 'New order: notify the team and issue an invoice',
    description: 'When an order is placed, create an invoice and tell the team.',
    trigger: 'order.created',
    graph: {
      nodes: [
        node('t', 'trigger', 40, 60), node('inv', 'create_invoice', 300, 60),
        node('n', 'notify', 560, 60, { title: 'New order #{{order.number}}', body: '{{order.customerName}} placed an order for {{order.total}} USDC.' }),
      ] as Graph['nodes'],
      edges: [{ from: 't', to: 'inv' }, { from: 'inv', to: 'n' }],
    },
  },
  {
    id: 'payment-verified',
    name: 'Verified USDC payment: start processing and notify',
    description: 'After the server verifies a payment onchain, move the order to processing and tell the team.',
    trigger: 'payment.verified',
    graph: {
      nodes: [
        node('t', 'trigger', 40, 60), node('s', 'update_order_status', 300, 60, { status: 'processing' }),
        node('n', 'notify', 560, 60, { title: 'Payment verified for order #{{order.number}}', body: '{{order.total}} USDC was verified onchain.' }),
      ] as Graph['nodes'],
      edges: [{ from: 't', to: 's' }, { from: 's', to: 'n' }],
    },
  },
  {
    id: 'support-ai-draft',
    name: 'New customer message: AI drafts a reply for review',
    description: 'Looks up your knowledge base and products, then saves a draft reply as an internal note. A person sends it.',
    trigger: 'support.message',
    graph: {
      nodes: [
        node('t', 'trigger', 40, 60),
        node('a', 'ai_draft', 300, 60, { mode: 'text', target: 'note', prompt: 'Draft a short, friendly reply to the customer message in {{conversation.lastMessage}} using the knowledge and product information provided.' }),
      ] as Graph['nodes'],
      edges: [{ from: 't', to: 'a' }],
    },
  },
  {
    id: 'status-changed',
    name: 'Order status changed: notify the team',
    description: 'Posts a notification when an order moves to fulfilled.',
    trigger: 'order.status_changed',
    graph: {
      nodes: [
        node('t', 'trigger', 40, 60), node('c', 'condition', 300, 60, { field: 'order.status', op: 'eq', value: 'fulfilled' }),
        node('n', 'notify', 560, 20, { title: 'Order #{{order.number}} fulfilled', body: 'Customer: {{order.customerName}}' }),
      ] as Graph['nodes'],
      edges: [{ from: 't', to: 'c' }, { from: 'c', to: 'n', branch: 'true' }],
    },
  },
  {
    id: 'daily-summary',
    name: 'Daily activity: AI summary',
    description: 'Once a day, summarizes the last 24 hours from your real records and posts it as a notification.',
    trigger: 'schedule.daily',
    graph: {
      nodes: [node('t', 'trigger', 40, 60), node('a', 'ai_draft', 300, 60, { mode: 'daily_summary', target: 'notification' })] as Graph['nodes'],
      edges: [{ from: 't', to: 'a' }],
    },
  },
]

export async function meta(ctx: Ctx) {
  await requireMember(ctx, 'workflows.view')
  return { triggers: TRIGGERS, actions: ACTION_TYPES, templates: TEMPLATES }
}

export async function listWorkflows(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.view')
  const list = await rows<WfRow & { last_status: string | null; last_run_at: string | null }>(sql`
    SELECT w.*, (SELECT status FROM workflow_runs r WHERE r.workflow_id = w.id ORDER BY started_at DESC LIMIT 1) AS last_status,
      (SELECT started_at FROM workflow_runs r WHERE r.workflow_id = w.id ORDER BY started_at DESC LIMIT 1) AS last_run_at
    FROM workflows w WHERE w.workspace_id = ${m.workspace.id} ORDER BY w.created_at DESC`)
  return { workflows: list.map(wfDto) }
}

async function load(ctx: Ctx, workspaceId: string): Promise<WfRow> {
  const id = ctx.params.fid ?? ''
  if (!isUuid(id)) throw notFound()
  const r = await rows<WfRow>(sql`SELECT * FROM workflows WHERE id = ${id} AND workspace_id = ${workspaceId}`)
  if (!r[0]) throw notFound()
  return r[0]
}

export async function createWorkflow(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.manage')
  const body = asBody(await ctx.body())
  const templateId = typeof body.template === 'string' ? body.template : ''
  const tpl = TEMPLATES.find((t) => t.id === templateId)
  const name = str(body, 'name', { min: 2, max: 100, optional: !!tpl }) || tpl?.name || ''
  const trigger = tpl?.trigger ?? oneOf(body, 'trigger', TRIGGERS)
  const graph = validateGraph(trigger, tpl?.graph ?? { nodes: [{ id: 't', type: 'trigger', x: 40, y: 60, config: {} }], edges: [] })
  const r = await rows<{ id: string }>(sql`
    INSERT INTO workflows (workspace_id, name, trigger, graph, created_by) VALUES (${m.workspace.id}, ${name}, ${trigger}, ${JSON.stringify(graph)}::text::jsonb, ${m.user.id}) RETURNING id`)
  await audit(ctx, m.workspace.id, 'workflow.created', { type: 'workflow', id: r[0]!.id })
  return { id: r[0]!.id }
}

export async function getWorkflow(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.view')
  const w = await load(ctx, m.workspace.id)
  const runs = await rows<{ id: string; source: string; status: string; steps: unknown; error: string | null; started_at: string; finished_at: string | null }>(sql`
    SELECT id, source, status, steps, error, started_at, finished_at FROM workflow_runs WHERE workflow_id = ${w.id} ORDER BY started_at DESC LIMIT 20`)
  return {
    workflow: wfDto(w),
    runs: runs.map((r) => ({ id: r.id, source: r.source, status: r.status, steps: r.steps, error: r.error, startedAt: r.started_at, finishedAt: r.finished_at })),
  }
}

export async function updateWorkflow(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.manage')
  const w = await load(ctx, m.workspace.id)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 100 })
  const trigger = oneOf(body, 'trigger', TRIGGERS)
  const graph = validateGraph(trigger, body.graph)
  const hasAction = graph.nodes.some((n) => n.type !== 'trigger' && n.type !== 'condition')
  const enabled = w.enabled && hasAction
  await sql`UPDATE workflows SET name = ${name}, trigger = ${trigger}, graph = ${JSON.stringify(graph)}::text::jsonb, enabled = ${enabled}, updated_at = now() WHERE id = ${w.id}`
  await audit(ctx, m.workspace.id, 'workflow.updated', { type: 'workflow', id: w.id })
  return { ok: true, enabled }
}

export async function setEnabled(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.manage')
  const w = await load(ctx, m.workspace.id)
  const enabled = bool(asBody(await ctx.body()), 'enabled', false)
  if (enabled && !w.graph.nodes.some((n) => n.type !== 'trigger' && n.type !== 'condition')) throw badRequest('Add at least one action before enabling this workflow.')
  await sql`UPDATE workflows SET enabled = ${enabled}, updated_at = now() WHERE id = ${w.id}`
  await audit(ctx, m.workspace.id, enabled ? 'workflow.enabled' : 'workflow.disabled', { type: 'workflow', id: w.id })
  return { ok: true }
}

export async function deleteWorkflow(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.manage')
  const w = await load(ctx, m.workspace.id)
  await sql`DELETE FROM workflows WHERE id = ${w.id}`
  await audit(ctx, m.workspace.id, 'workflow.deleted', { type: 'workflow', id: w.id })
  return { ok: true }
}

/** Manual execution. The records the run may touch are limited to this workspace by the engine. */
export async function runNow(ctx: Ctx) {
  const m = await requireMember(ctx, 'workflows.run')
  rateLimit(`wfrun:${m.user.id}`, 20, 10 * 60_000)
  const w = await load(ctx, m.workspace.id)
  const body = asBody(await ctx.body())
  const orderId = typeof body.orderId === 'string' && body.orderId ? body.orderId : undefined
  const conversationId = typeof body.conversationId === 'string' && body.conversationId ? body.conversationId : undefined
  if ((orderId && !isUuid(orderId)) || (conversationId && !isUuid(conversationId))) throw badRequest('Choose a valid record.')
  const run = await runWorkflow(w, 'manual', { orderId, conversationId }, m.user.id)
  await audit(ctx, m.workspace.id, 'workflow.run', { type: 'workflow', id: w.id }, { status: run.status })
  return { run }
}

// ---------- notifications ----------
export async function listNotifications(ctx: Ctx) {
  const m = await requireMember(ctx, 'workspace.view')
  const list = await rows<{ id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }>(sql`
    SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE workspace_id = ${m.workspace.id} ORDER BY created_at DESC LIMIT 50`)
  const unread = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM notifications WHERE workspace_id = ${m.workspace.id} AND read_at IS NULL`)
  return {
    unread: unread[0]!.n,
    notifications: list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.read_at, aiGenerated: n.kind === 'ai', createdAt: n.created_at })),
  }
}

export async function markRead(ctx: Ctx) {
  const m = await requireMember(ctx, 'workspace.view')
  const body = asBody(await ctx.body())
  if (typeof body.id === 'string' && isUuid(body.id)) await sql`UPDATE notifications SET read_at = now() WHERE id = ${body.id} AND workspace_id = ${m.workspace.id} AND read_at IS NULL`
  else await sql`UPDATE notifications SET read_at = now() WHERE workspace_id = ${m.workspace.id} AND read_at IS NULL`
  return { ok: true }
}
