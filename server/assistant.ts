import { aiConfigured, chat, GUARDRAILS, type ChatMessage } from './ai'
import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, bool, int, isUuid, notFound, rateLimit, str } from './http'
import { businessStats, retrieve, type BusinessStats, type Source } from './knowledge'

interface SettingsRow {
  instructions: string
  auto_reply: boolean
}

export async function loadSettings(workspaceId: string): Promise<{ instructions: string; autoReply: boolean }> {
  const r = await rows<SettingsRow>(sql`SELECT instructions, auto_reply FROM ai_settings WHERE workspace_id = ${workspaceId}`)
  return { instructions: r[0]?.instructions ?? '', autoReply: r[0]?.auto_reply ?? false }
}

export async function getSettings(ctx: Ctx) {
  const m = await requireMember(ctx, 'workspace.view')
  return { configured: aiConfigured(), ...(await loadSettings(m.workspace.id)) }
}

export async function saveSettings(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.settings')
  const body = asBody(await ctx.body())
  const instructions = str(body, 'instructions', { max: 2000, optional: true })
  const autoReply = bool(body, 'autoReply', false)
  await sql`
    INSERT INTO ai_settings (workspace_id, instructions, auto_reply) VALUES (${m.workspace.id}, ${instructions}, ${autoReply})
    ON CONFLICT (workspace_id) DO UPDATE SET instructions = EXCLUDED.instructions, auto_reply = EXCLUDED.auto_reply, updated_at = now()`
  await audit(ctx, m.workspace.id, 'ai.settings_updated', undefined, { autoReply })
  return { ok: true }
}

export function systemPrompt(businessName: string, instructions: string, extra = ''): string {
  return [
    GUARDRAILS,
    `Business: ${businessName}.`,
    instructions ? `Business instructions from the owner (follow them unless they conflict with the rules above):\n${instructions}` : '',
    extra,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const statsText = (s: BusinessStats): string => `Verified business figures (last ${s.days} days). Orders are offchain business records; verified payments are confirmed onchain.\n${JSON.stringify(s)}`

// ---------- merchant chat ----------
export async function chatWithAssistant(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.use')
  rateLimit(`ai:${m.user.id}`, 30, 10 * 60_000)
  const body = asBody(await ctx.body())
  const message = str(body, 'message', { min: 1, max: 2000 })
  const cid = typeof body.conversationId === 'string' ? body.conversationId : ''

  if (cid) {
    if (!isUuid(cid)) throw notFound()
    const own = await rows<{ id: string }>(sql`SELECT id FROM ai_conversations WHERE id = ${cid} AND workspace_id = ${m.workspace.id} AND user_id = ${m.user.id}`)
    if (!own[0]) throw notFound()
  }

  const history = await rows<{ role: 'user' | 'assistant'; content: string }>(sql`
    SELECT role, content FROM ai_messages WHERE conversation_id = ${cid || null} ORDER BY created_at DESC LIMIT 10`)
  history.reverse()

  const settings = await loadSettings(m.workspace.id)
  const found = await retrieve(m.workspace.id, message, { publicOnly: false })
  const stats = await businessStats(m.workspace.id, m.role, 30)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(m.workspace.name, settings.instructions, `You are talking to a team member (${m.role}) of this business.\nCONTEXT\n${statsText(stats)}\n\n${found.context || 'No matching knowledge or products were found.'}`) },
    ...history,
    { role: 'user', content: message },
  ]
  const answer = await chat(messages) // throws a clear error when AI is not configured; nothing is saved then
  let conversationId = cid
  if (!conversationId) {
    const created = await rows<{ id: string }>(sql`
      INSERT INTO ai_conversations (workspace_id, user_id, title) VALUES (${m.workspace.id}, ${m.user.id}, ${message.slice(0, 60)}) RETURNING id`)
    conversationId = created[0]!.id
  }
  await sql`INSERT INTO ai_messages (conversation_id, role, content) VALUES (${conversationId}, 'user', ${message})`
  const saved = await rows<{ id: string; created_at: string }>(sql`
    INSERT INTO ai_messages (conversation_id, role, content, sources) VALUES (${conversationId}, 'assistant', ${answer}, ${JSON.stringify(found.sources)}::text::jsonb)
    RETURNING id, created_at`)
  await sql`UPDATE ai_conversations SET updated_at = now() WHERE id = ${conversationId}`
  return { conversationId, message: { id: saved[0]!.id, role: 'assistant', content: answer, sources: found.sources satisfies Source[], aiGenerated: true, createdAt: saved[0]!.created_at } }
}

export async function listAiConversations(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.use')
  const list = await rows<{ id: string; title: string; updated_at: string }>(sql`
    SELECT id, title, updated_at FROM ai_conversations WHERE workspace_id = ${m.workspace.id} AND user_id = ${m.user.id} ORDER BY updated_at DESC LIMIT 50`)
  return { conversations: list.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at })) }
}

export async function getAiConversation(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.use')
  const id = ctx.params.aid ?? ''
  if (!isUuid(id)) throw notFound()
  const own = await rows<{ id: string; title: string }>(sql`SELECT id, title FROM ai_conversations WHERE id = ${id} AND workspace_id = ${m.workspace.id} AND user_id = ${m.user.id}`)
  if (!own[0]) throw notFound()
  const msgs = await rows<{ id: string; role: string; content: string; sources: Source[]; created_at: string }>(sql`
    SELECT id, role, content, sources, created_at FROM ai_messages WHERE conversation_id = ${id} ORDER BY created_at`)
  return {
    id,
    title: own[0].title,
    messages: msgs.map((x) => ({ id: x.id, role: x.role, content: x.content, sources: x.sources, aiGenerated: x.role === 'assistant', createdAt: x.created_at })),
  }
}

export async function deleteAiConversation(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.use')
  const id = ctx.params.aid ?? ''
  if (!isUuid(id)) throw notFound()
  await sql`DELETE FROM ai_conversations WHERE id = ${id} AND workspace_id = ${m.workspace.id} AND user_id = ${m.user.id}`
  return { ok: true }
}

// ---------- product descriptions ----------
export async function describeProduct(ctx: Ctx) {
  const m = await requireMember(ctx, 'products.manage')
  await requireMember(ctx, 'ai.use')
  rateLimit(`ai:${m.user.id}`, 30, 10 * 60_000)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 120 })
  const notes = str(body, 'notes', { max: 1000, optional: true })
  const settings = await loadSettings(m.workspace.id)
  const text = await chat(
    [
      { role: 'system', content: systemPrompt(m.workspace.name, settings.instructions, 'Task: write a clear, honest product description of 2 to 4 short sentences for an online store. Use only the facts given. Do not invent specifications, materials, sizes or claims. Plain text only.') },
      { role: 'user', content: `CONTEXT\nProduct name: ${name}\nMerchant notes: ${notes || '(none)'}` },
    ],
    { maxTokens: 300 },
  )
  return { draft: text, aiGenerated: true }
}

// ---------- reports ----------
export async function businessReport(ctx: Ctx) {
  const m = await requireMember(ctx, 'ai.use')
  rateLimit(`ai:${m.user.id}`, 30, 10 * 60_000)
  const body = asBody(await ctx.body())
  const days = int(body, 'days', { min: 1, max: 90, optional: true }) ?? 30
  const stats = await businessStats(m.workspace.id, m.role, days)
  if (!aiConfigured()) return { stats, narrative: null, aiConfigured: false }
  const settings = await loadSettings(m.workspace.id)
  const narrative = await chat(
    [
      { role: 'system', content: systemPrompt(m.workspace.name, settings.instructions, 'Task: write a short plain-language business summary (under 150 words) for the owner from the figures in CONTEXT. Quote figures exactly as given and never add numbers that are not in CONTEXT. Mention that orders are offchain records and verified payments are confirmed onchain.') },
      { role: 'user', content: `CONTEXT\n${statsText(stats)}` },
    ],
    { maxTokens: 400 },
  )
  return { stats, narrative, aiConfigured: true }
}
