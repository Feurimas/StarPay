import { aiConfigured, chat } from './ai'
import { loadSettings, systemPrompt } from './assistant'
import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, email, isUuid, newToken, notFound, rateLimit, str, safeMessage } from './http'
import { retrieve } from './knowledge'
import { usd } from './money'
import { emitEvent } from './workflowEngine'

interface ConvRow {
  id: string
  workspace_id: string
  public_id: string
  customer_id: string | null
  customer_name: string
  customer_email: string
  subject: string
  channel: string
  status: string
  assigned_to: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

const convDto = (c: ConvRow & { assignee_name?: string | null; last_message?: string | null; last_sender?: string | null }) => ({
  id: c.id,
  subject: c.subject,
  customerName: c.customer_name,
  customerEmail: c.customer_email,
  customerId: c.customer_id,
  channel: c.channel,
  status: c.status,
  assignedTo: c.assigned_to,
  assigneeName: c.assignee_name ?? null,
  tags: c.tags,
  lastMessage: c.last_message ?? null,
  lastSender: c.last_sender ?? null,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
})

// ---------- merchant inbox ----------
export async function listConversations(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.view')
  const status = ctx.url.searchParams.get('status') ?? 'open'
  const assigned = ctx.url.searchParams.get('assigned') ?? 'all'
  const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const like = `%${q}%`
  const list = await rows<ConvRow & { assignee_name: string | null; last_message: string | null; last_sender: string | null }>(sql`
    SELECT c.*, u.name AS assignee_name,
      (SELECT body FROM support_messages x WHERE x.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT sender FROM support_messages x WHERE x.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_sender
    FROM support_conversations c LEFT JOIN users u ON u.id = c.assigned_to
    WHERE c.workspace_id = ${m.workspace.id}
      AND (${status === 'all'} OR c.status = ${status === 'resolved' ? 'resolved' : 'open'})
      AND (${assigned === 'all'} OR (${assigned === 'me'} AND c.assigned_to = ${m.user.id}) OR (${assigned === 'unassigned'} AND c.assigned_to IS NULL))
      AND (${q === ''} OR c.subject ILIKE ${like} OR c.customer_name ILIKE ${like} OR c.customer_email ILIKE ${like})
    ORDER BY c.updated_at DESC LIMIT 100`)
  return { conversations: list.map(convDto) }
}

async function loadConv(ctx: Ctx, workspaceId: string): Promise<ConvRow> {
  const id = ctx.params.cid ?? ''
  if (!isUuid(id)) throw notFound()
  const r = await rows<ConvRow>(sql`SELECT * FROM support_conversations WHERE id = ${id} AND workspace_id = ${workspaceId}`)
  if (!r[0]) throw notFound()
  return r[0]
}

export async function getConversation(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.view')
  const c = await loadConv(ctx, m.workspace.id)
  const messages = await rows<{ id: string; sender: string; body: string; user_id: string | null; created_at: string }>(sql`
    SELECT id, sender, body, user_id, created_at FROM support_messages WHERE conversation_id = ${c.id} ORDER BY created_at`)
  const notes = await rows<{ id: string; body: string; ai_generated: boolean; author: string | null; created_at: string }>(sql`
    SELECT n.id, n.body, n.ai_generated, u.name AS author, n.created_at FROM support_notes n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.conversation_id = ${c.id} ORDER BY n.created_at`)
  const orders = await rows<{ id: string; number: number; status: string; payment_status: string; total_units: unknown }>(sql`
    SELECT id, number, status, payment_status, total_units FROM orders
    WHERE workspace_id = ${m.workspace.id} AND (customer_id = ${c.customer_id} OR lower(customer_email) = lower(${c.customer_email}))
    ORDER BY created_at DESC LIMIT 5`)
  const assignee = c.assigned_to ? (await rows<{ name: string }>(sql`SELECT name FROM users WHERE id = ${c.assigned_to}`))[0]?.name ?? null : null
  return {
    conversation: convDto({ ...c, assignee_name: assignee }),
    messages: messages.map((x) => ({ id: x.id, sender: x.sender, body: x.body, aiGenerated: x.sender === 'ai', createdAt: x.created_at })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, aiGenerated: n.ai_generated, author: n.author, createdAt: n.created_at })),
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, paymentStatus: o.payment_status, total: usd(o.total_units) })),
  }
}

export async function reply(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.manage')
  const c = await loadConv(ctx, m.workspace.id)
  const text = str(asBody(await ctx.body()), 'body', { min: 1, max: 4000 })
  await sql`INSERT INTO support_messages (conversation_id, sender, user_id, body) VALUES (${c.id}, 'agent', ${m.user.id}, ${text})`
  await sql`UPDATE support_conversations SET updated_at = now(), assigned_to = coalesce(assigned_to, ${m.user.id}) WHERE id = ${c.id}`
  return { ok: true }
}

export async function addNote(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.manage')
  const c = await loadConv(ctx, m.workspace.id)
  const text = str(asBody(await ctx.body()), 'body', { min: 1, max: 4000 })
  await sql`INSERT INTO support_notes (conversation_id, user_id, body) VALUES (${c.id}, ${m.user.id}, ${text})`
  return { ok: true }
}

export async function updateConversation(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.manage')
  const c = await loadConv(ctx, m.workspace.id)
  const body = asBody(await ctx.body())
  if (body.status !== undefined) {
    if (body.status !== 'open' && body.status !== 'resolved') throw badRequest('Status must be open or resolved.')
    await sql`UPDATE support_conversations SET status = ${body.status}, updated_at = now() WHERE id = ${c.id}`
  }
  if (body.assignedTo !== undefined) {
    let target: string | null = null
    if (body.assignedTo === 'me') target = m.user.id
    else if (typeof body.assignedTo === 'string' && body.assignedTo) {
      if (!isUuid(body.assignedTo)) throw badRequest('Unknown team member.')
      const mem = await rows<{ user_id: string }>(sql`SELECT user_id FROM memberships WHERE workspace_id = ${m.workspace.id} AND user_id = ${body.assignedTo}`)
      if (!mem[0]) throw badRequest('That person is not a member of this workspace.')
      target = body.assignedTo
    }
    await sql`UPDATE support_conversations SET assigned_to = ${target}, updated_at = now() WHERE id = ${c.id}`
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 8) throw badRequest('Use up to 8 tags.')
    const tags = [...new Set(body.tags.map((t) => String(t).toLowerCase().trim()))]
    if (tags.some((t) => !/^[a-z0-9][a-z0-9-]{1,23}$/.test(t))) throw badRequest('Tags use letters, numbers and dashes (2 to 24 characters).')
    await sql`UPDATE support_conversations SET tags = ${sql.array(tags, 'TEXT')}::text[], updated_at = now() WHERE id = ${c.id}`
  }
  await audit(ctx, m.workspace.id, 'support.updated', { type: 'conversation', id: c.id })
  return { ok: true }
}

/** AI drafts a reply for the agent to review. It is never sent automatically. */
export async function aiDraft(ctx: Ctx) {
  const m = await requireMember(ctx, 'support.manage')
  await requireMember(ctx, 'ai.use')
  rateLimit(`ai:${m.user.id}`, 30, 10 * 60_000)
  const c = await loadConv(ctx, m.workspace.id)
  const msgs = await rows<{ sender: string; body: string }>(sql`SELECT sender, body FROM support_messages WHERE conversation_id = ${c.id} ORDER BY created_at DESC LIMIT 8`)
  msgs.reverse()
  const lastCustomer = [...msgs].reverse().find((x) => x.sender === 'customer')?.body ?? c.subject
  const found = await retrieve(m.workspace.id, `${c.subject} ${lastCustomer}`, { publicOnly: false })
  const orders = await rows<{ number: number; status: string; payment_status: string; total_units: unknown }>(sql`
    SELECT number, status, payment_status, total_units FROM orders
    WHERE workspace_id = ${m.workspace.id} AND lower(customer_email) = lower(${c.customer_email}) ORDER BY created_at DESC LIMIT 3`)
  const settings = await loadSettings(m.workspace.id)
  const transcript = msgs.map((x) => `${x.sender}: ${x.body}`).join('\n')
  const orderText = orders.length ? orders.map((o) => `Order #${o.number}: ${o.status}, payment ${o.payment_status}, total ${usd(o.total_units)} USDC`).join('\n') : 'No orders found for this customer.'
  const draft = await chat(
    [
      { role: 'system', content: systemPrompt(m.workspace.name, settings.instructions, 'Task: draft a short, friendly reply to the customer for a human agent to review. Use only CONTEXT. Do not promise refunds, discounts or delivery dates unless CONTEXT says so. Never say a payment is confirmed unless the order record says paid.') },
      { role: 'user', content: `CONTEXT\nCustomer: ${c.customer_name}\nSubject: ${c.subject}\nConversation:\n${transcript}\n\nCustomer orders:\n${orderText}\n\n${found.context || 'No matching knowledge found.'}` },
    ],
    { maxTokens: 400 },
  )
  return { draft, aiGenerated: true, sources: found.sources }
}

// ---------- public storefront support ----------
async function storeByUrl(slug: string) {
  const r = await rows<{ workspace_id: string; slug: string; title: string; name: string }>(sql`
    SELECT s.workspace_id, s.slug, s.title, w.name FROM storefronts s JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.slug = ${slug} AND s.published AND w.deleted_at IS NULL`)
  if (!r[0]) throw notFound('Store not found.')
  return r[0]
}

/** Customer-facing AI reply: public knowledge and active products only. Opt-in per workspace. */
async function maybeAutoReply(workspaceId: string, businessName: string, conversationId: string, customerText: string) {
  try {
    const settings = await loadSettings(workspaceId)
    if (!settings.autoReply || !aiConfigured()) return
    const found = await retrieve(workspaceId, customerText, { publicOnly: true })
    const text = await chat(
      [
        { role: 'system', content: systemPrompt(businessName, settings.instructions, 'You are replying directly to a customer. Answer only from CONTEXT. If CONTEXT does not answer, say a team member will follow up. You cannot see orders or payments and must not discuss them. Keep it under 80 words.') },
        { role: 'user', content: `CONTEXT\n${found.context || 'No matching public information.'}\n\nCustomer message:\n${customerText}` },
      ],
      { maxTokens: 250 },
    )
    await sql`INSERT INTO support_messages (conversation_id, sender, body) VALUES (${conversationId}, 'ai', ${text})`
  } catch (e) {
    console.error('auto-reply skipped', safeMessage(e))
  }
}

export async function startPublicConversation(ctx: Ctx) {
  rateLimit(`support:${ctx.ip}`, 6, 60 * 60_000)
  const store = await storeByUrl(ctx.params.slug ?? '')
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 100 })
  const mail = email(body)
  const subject = str(body, 'subject', { min: 3, max: 120 })
  const message = str(body, 'message', { min: 3, max: 4000 })
  const customer = await rows<{ id: string }>(sql`SELECT id FROM customers WHERE workspace_id = ${store.workspace_id} AND lower(email) = ${mail}`)
  const publicId = newToken().slice(0, 22)
  const created = await rows<{ id: string }>(sql`
    INSERT INTO support_conversations (workspace_id, public_id, customer_id, customer_name, customer_email, subject)
    VALUES (${store.workspace_id}, ${publicId}, ${customer[0]?.id ?? null}, ${name}, ${mail}, ${subject}) RETURNING id`)
  const id = created[0]!.id
  await sql`INSERT INTO support_messages (conversation_id, sender, body) VALUES (${id}, 'customer', ${message})`
  await maybeAutoReply(store.workspace_id, store.name, id, message)
  emitEvent(store.workspace_id, 'support.message', { conversationId: id })
  return { publicId }
}

async function publicConv(publicId: string) {
  const r = await rows<ConvRow & { store_slug: string; store_title: string; workspace_name: string }>(sql`
    SELECT c.*, s.slug AS store_slug, s.title AS store_title, w.name AS workspace_name
    FROM support_conversations c JOIN storefronts s ON s.workspace_id = c.workspace_id JOIN workspaces w ON w.id = c.workspace_id
    WHERE c.public_id = ${publicId} AND w.deleted_at IS NULL`)
  if (!r[0]) throw notFound('Conversation not found.')
  return r[0]
}

export async function getPublicConversation(ctx: Ctx) {
  const c = await publicConv(ctx.params.pid ?? '')
  const msgs = await rows<{ sender: string; body: string; created_at: string }>(sql`SELECT sender, body, created_at FROM support_messages WHERE conversation_id = ${c.id} ORDER BY created_at`)
  return {
    subject: c.subject,
    status: c.status,
    store: { slug: c.store_slug, title: c.store_title },
    messages: msgs.map((x) => ({ sender: x.sender, body: x.body, aiGenerated: x.sender === 'ai', createdAt: x.created_at })),
  }
}

export async function postPublicMessage(ctx: Ctx) {
  rateLimit(`support-msg:${ctx.ip}`, 30, 60 * 60_000)
  const c = await publicConv(ctx.params.pid ?? '')
  const message = str(asBody(await ctx.body()), 'message', { min: 1, max: 4000 })
  await sql`INSERT INTO support_messages (conversation_id, sender, body) VALUES (${c.id}, 'customer', ${message})`
  await sql`UPDATE support_conversations SET status = 'open', updated_at = now() WHERE id = ${c.id}`
  await maybeAutoReply(c.workspace_id, c.workspace_name, c.id, message)
  emitEvent(c.workspace_id, 'support.message', { conversationId: c.id })
  return { ok: true }
}
