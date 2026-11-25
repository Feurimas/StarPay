import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, notFound, isUuid, oneOf, str } from './http'
import { can, type Role } from '../src/lib/permissions'
import { usd } from './money'

// ---------- knowledge base CRUD ----------
interface DocRow {
  id: string
  title: string
  body: string
  kind: string
  visibility: string
  updated_at: string
}
const docDto = (d: DocRow) => ({ id: d.id, title: d.title, body: d.body, kind: d.kind, visibility: d.visibility, updatedAt: d.updated_at })

export async function listDocs(ctx: Ctx) {
  const m = await requireMember(ctx, 'knowledge.view')
  const list = await rows<DocRow>(sql`SELECT id, title, body, kind, visibility, updated_at FROM knowledge_docs WHERE workspace_id = ${m.workspace.id} ORDER BY updated_at DESC LIMIT 200`)
  return { docs: list.map(docDto) }
}

function parseDoc(body: ReturnType<typeof asBody>) {
  return {
    title: str(body, 'title', { min: 2, max: 120 }),
    text: str(body, 'body', { min: 5, max: 8000 }),
    kind: oneOf(body, 'kind', ['faq', 'policy', 'note'] as const),
    visibility: oneOf(body, 'visibility', ['public', 'internal'] as const),
  }
}

export async function createDoc(ctx: Ctx) {
  const m = await requireMember(ctx, 'knowledge.manage')
  const d = parseDoc(asBody(await ctx.body()))
  const r = await rows<{ id: string }>(sql`
    INSERT INTO knowledge_docs (workspace_id, title, body, kind, visibility, created_by)
    VALUES (${m.workspace.id}, ${d.title}, ${d.text}, ${d.kind}, ${d.visibility}, ${m.user.id}) RETURNING id`)
  await audit(ctx, m.workspace.id, 'knowledge.created', { type: 'knowledge', id: r[0]!.id })
  return { id: r[0]!.id }
}

export async function updateDoc(ctx: Ctx) {
  const m = await requireMember(ctx, 'knowledge.manage')
  const id = ctx.params.kid ?? ''
  if (!isUuid(id)) throw notFound()
  const d = parseDoc(asBody(await ctx.body()))
  const r = await rows<{ id: string }>(sql`
    UPDATE knowledge_docs SET title = ${d.title}, body = ${d.text}, kind = ${d.kind}, visibility = ${d.visibility}, updated_at = now()
    WHERE id = ${id} AND workspace_id = ${m.workspace.id} RETURNING id`)
  if (!r[0]) throw notFound()
  return { ok: true }
}

export async function deleteDoc(ctx: Ctx) {
  const m = await requireMember(ctx, 'knowledge.manage')
  const id = ctx.params.kid ?? ''
  if (!isUuid(id)) throw notFound()
  await sql`DELETE FROM knowledge_docs WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'knowledge.deleted', { type: 'knowledge', id })
  return { ok: true }
}

// ---------- retrieval ----------
export interface Source {
  type: 'knowledge' | 'product'
  id: string
  title: string
}
export interface Retrieved {
  context: string
  sources: Source[]
}

const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'can', 'you', 'your', 'are', 'does', 'this', 'that', 'have', 'from', 'about', 'please', 'tell', 'any'])
export function tokens(query: string): string[] {
  const out = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  return [...new Set(out.filter((t) => !STOP.has(t)))].slice(0, 8)
}

/**
 * Retrieval is always scoped to ONE workspace. publicOnly restricts to documents the business marked
 * public plus active products, which is all a customer-facing answer may use.
 */
export async function retrieve(workspaceId: string, query: string, opts: { publicOnly: boolean }): Promise<Retrieved> {
  const toks = tokens(query)
  const sources: Source[] = []
  const parts: string[] = []
  if (toks.length > 0) {
    const tsq = toks.join(' | ')
    const docs = await rows<{ id: string; title: string; body: string }>(sql`
      SELECT id, title, body FROM knowledge_docs
      WHERE workspace_id = ${workspaceId} AND (${!opts.publicOnly} OR visibility = 'public')
        AND search @@ to_tsquery('simple', ${tsq})
      ORDER BY ts_rank(search, to_tsquery('simple', ${tsq})) DESC LIMIT 4`)
    for (const d of docs) {
      sources.push({ type: 'knowledge', id: d.id, title: d.title })
      parts.push(`[Knowledge: ${d.title}]\n${d.body.slice(0, 1200)}`)
    }
    const patterns = toks.map((t) => `%${t}%`)
    const prods = await rows<{ id: string; name: string; description: string; price_units: string; track_inventory: boolean; stock: number }>(sql`
      SELECT id, name, description, price_units, track_inventory, stock FROM products
      WHERE workspace_id = ${workspaceId} AND status = 'active'
        AND (name ILIKE ANY (${sql.array(patterns, 'TEXT')}::text[]) OR description ILIKE ANY (${sql.array(patterns, 'TEXT')}::text[]))
      ORDER BY name LIMIT 4`)
    for (const p of prods) {
      sources.push({ type: 'product', id: p.id, title: p.name })
      const avail = !p.track_inventory ? 'available' : p.stock > 0 ? 'in stock' : 'out of stock'
      parts.push(`[Product: ${p.name}] Price ${usd(p.price_units)} USDC, ${avail}. ${p.description.slice(0, 500)}`)
    }
  }
  return { context: parts.join('\n\n'), sources }
}

// ---------- aggregate business stats (no personal data) ----------
export interface BusinessStats {
  days: number
  orders?: { total: number; pending: number; processing: number; fulfilled: number; cancelled: number; valueUsdc: string }
  payments?: { verifiedCount: number; verifiedUsdc: string }
  support?: { open: number }
  lowStockProducts?: number
}

/** Only the sections the caller's role may see are included. The AI is fed exactly this object. */
export async function businessStats(workspaceId: string, role: Role, days: number): Promise<BusinessStats> {
  const out: BusinessStats = { days }
  if (can(role, 'orders.view')) {
    const r = await rows<{ total: number; pending: number; processing: number; fulfilled: number; cancelled: number; value: string }>(sql`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'processing')::int AS processing,
        count(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        coalesce(sum(total_units) FILTER (WHERE status <> 'cancelled'), 0)::text AS value
      FROM orders WHERE workspace_id = ${workspaceId} AND created_at > now() - make_interval(days => ${days})`)
    const o = r[0]!
    out.orders = { total: o.total, pending: o.pending, processing: o.processing, fulfilled: o.fulfilled, cancelled: o.cancelled, valueUsdc: usd(o.value) }
    const lows = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM products WHERE workspace_id = ${workspaceId} AND status = 'active' AND track_inventory AND stock <= 3`)
    out.lowStockProducts = lows[0]!.n
  }
  if (can(role, 'payments.view')) {
    const p = await rows<{ n: number; total: string }>(sql`
      SELECT count(*)::int AS n, coalesce(sum(amount_units), 0)::text AS total FROM payments
      WHERE workspace_id = ${workspaceId} AND status = 'confirmed' AND confirmed_at > now() - make_interval(days => ${days})`)
    out.payments = { verifiedCount: p[0]!.n, verifiedUsdc: usd(p[0]!.total) }
  }
  if (can(role, 'support.view')) {
    const s = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM support_conversations WHERE workspace_id = ${workspaceId} AND status = 'open'`)
    out.support = { open: s[0]!.n }
  }
  return out
}
