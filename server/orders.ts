import { emitEvent } from './workflowEngine'
import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, conflict, forbidden, isUuid, notFound, oneOf, str } from './http'
import { big, usd } from './money'
import { createOrder, nextNumber, parseCart, publicId } from './ordering'
import { parseCustomer } from './public'

const STATUSES = ['pending', 'processing', 'fulfilled', 'cancelled'] as const
const NEXT: Record<string, string[]> = {
  pending: ['processing', 'fulfilled', 'cancelled'],
  processing: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
}

interface OrderRow {
  id: string
  number: unknown
  customer_id: string | null
  customer_name: string
  customer_email: string
  status: string
  payment_status: string
  subtotal_units: unknown
  discount_units: unknown
  total_units: unknown
  discount_code: string | null
  notes: string
  ship_to: unknown
  public_id: string
  created_at: Date
  updated_at: Date
}

const orderDto = (o: OrderRow) => ({
  id: o.id,
  number: String(big(o.number)),
  customerId: o.customer_id,
  customerName: o.customer_name,
  customerEmail: o.customer_email,
  status: o.status,
  paymentStatus: o.payment_status,
  subtotal: usd(o.subtotal_units),
  discount: usd(o.discount_units),
  total: usd(o.total_units),
  discountCode: o.discount_code,
  notes: o.notes,
  shipTo: o.ship_to,
  createdAt: o.created_at,
  updatedAt: o.updated_at,
})

export async function listOrders(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  const status = ctx.url.searchParams.get('status')
  if (status && !(STATUSES as readonly string[]).includes(status)) throw badRequest('Unknown status.')
  const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const like = `%${q.replace(/[%_\\]/g, '')}%`
  const list = await rows<OrderRow>(sql`
    SELECT * FROM orders WHERE workspace_id = ${m.workspace.id}
      AND (${status}::text IS NULL OR status = ${status}::text)
      AND (${q} = '' OR customer_name ILIKE ${like} OR customer_email ILIKE ${like} OR number::text = ${q.replace(/^#/, '')})
    ORDER BY created_at DESC LIMIT 200`)
  return { orders: list.map(orderDto) }
}

async function loadOrder(workspaceId: string, id: string) {
  if (!isUuid(id)) throw notFound('Order not found.')
  const found = await rows<OrderRow>(sql`SELECT * FROM orders WHERE id = ${id} AND workspace_id = ${workspaceId}`)
  if (!found[0]) throw notFound('Order not found.')
  return found[0]
}

export async function getOrder(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  const o = await loadOrder(m.workspace.id, ctx.params.oid ?? '')
  const items = await rows<{ id: string; product_id: string | null; name: string; unit_price_units: unknown; quantity: number; line_total_units: unknown }>(sql`
    SELECT id, product_id, name, unit_price_units, quantity, line_total_units FROM order_items WHERE order_id = ${o.id} ORDER BY name`)
  const events = await rows<{ id: string; kind: string; detail: string; actor: string | null; created_at: Date }>(sql`
    SELECT e.id::text, e.kind, e.detail, u.name AS actor, e.created_at
    FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ${o.id} ORDER BY e.created_at, e.id`)
  const invoice = await rows<{ id: string; number: string; public_id: string; status: string }>(sql`
    SELECT id, number, public_id, status FROM invoices WHERE order_id = ${o.id}`)
  const store = await rows<{ slug: string }>(sql`SELECT slug FROM storefronts WHERE workspace_id = ${m.workspace.id}`)
  return {
    order: { ...orderDto(o), publicId: (await rows<{ public_id: string }>(sql`SELECT public_id FROM orders WHERE id = ${o.id}`))[0]!.public_id },
    items: items.map((i) => ({ id: i.id, productId: i.product_id, name: i.name, unitPrice: usd(i.unit_price_units), quantity: i.quantity, lineTotal: usd(i.line_total_units) })),
    events: events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, actor: e.actor, at: e.created_at })),
    invoice: invoice[0] ? { id: invoice[0].id, number: invoice[0].number, publicId: invoice[0].public_id, status: invoice[0].status } : null,
    storeSlug: store[0]?.slug ?? null,
  }
}

/** Manual order entry by staff. Same pricing, stock and discount rules as public checkout. */
export async function createManualOrder(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.manage')
  const body = asBody(await ctx.body())
  const customer = parseCustomer(asBody(body.customer))
  const code = str(body, 'discountCode', { max: 30, optional: true })
  const notes = str(body, 'notes', { max: 500, optional: true })
  const order = await createOrder(m.workspace.id, parseCart(body.items), customer, code || null, notes, m.user.id)
  await audit(ctx, m.workspace.id, 'order.created', { type: 'order', id: order.id }, { number: order.number })
  emitEvent(m.workspace.id, 'order.created', { orderId: order.id })
  return { id: order.id }
}

export async function updateOrderStatus(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.manage')
  const o = await loadOrder(m.workspace.id, ctx.params.oid ?? '')
  const next = oneOf(asBody(await ctx.body()), 'status', STATUSES)
  if (!NEXT[o.status]?.includes(next)) throw conflict(`An order that is ${o.status} cannot be changed to ${next}.`)
  if (next === 'cancelled' && o.payment_status !== 'unpaid') {
    throw conflict('This order has a payment. Refunds are handled as a separate verified transaction in a later phase.')
  }
  await sql.begin(async (tx) => {
    const changed = await rows<{ id: string }>(tx`
      UPDATE orders SET status = ${next}, updated_at = now() WHERE id = ${o.id} AND status = ${o.status} RETURNING id`)
    if (!changed[0]) throw conflict('This order was just changed by someone else. Reload and try again.')
    if (next === 'cancelled') {
      // Put reserved stock and the discount use back.
      await tx`
        UPDATE products p SET stock = p.stock + i.quantity, updated_at = now()
        FROM order_items i WHERE i.order_id = ${o.id} AND i.product_id = p.id AND p.track_inventory`
      if (o.discount_code) {
        await tx`UPDATE discounts SET used_count = GREATEST(used_count - 1, 0) WHERE workspace_id = ${m.workspace.id} AND upper(code) = upper(${o.discount_code})`
      }
      await tx`UPDATE invoices SET status = 'void' WHERE order_id = ${o.id}`
    }
    await tx`INSERT INTO order_events (order_id, kind, detail, user_id) VALUES (${o.id}, 'status', ${`${o.status} to ${next}`}, ${m.user.id})`
  })
  await audit(ctx, m.workspace.id, 'order.status_changed', { type: 'order', id: o.id }, { from: o.status, to: next })
  emitEvent(m.workspace.id, 'order.status_changed', { orderId: o.id, orderStatus: next })
  return { ok: true }
}

export async function updateOrderNotes(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.manage')
  const o = await loadOrder(m.workspace.id, ctx.params.oid ?? '')
  const notes = str(asBody(await ctx.body()), 'notes', { max: 500, optional: true })
  await sql`UPDATE orders SET notes = ${notes}, updated_at = now() WHERE id = ${o.id}`
  await sql`INSERT INTO order_events (order_id, kind, detail, user_id) VALUES (${o.id}, 'note', 'Notes updated', ${m.user.id})`
  return { ok: true }
}

// ---------- customers ----------
interface CustomerRow {
  id: string; name: string; email: string; phone: string | null; country: string | null; address_line1: string | null
  address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; notes: string
  created_at: Date; order_count?: number; spent_units?: unknown
}

const customerDto = (c: CustomerRow) => ({
  id: c.id, name: c.name, email: c.email, phone: c.phone, country: c.country, addressLine1: c.address_line1,
  addressLine2: c.address_line2, city: c.city, region: c.region, postalCode: c.postal_code, notes: c.notes,
  createdAt: c.created_at, orderCount: c.order_count ?? 0, totalOrdered: usd(c.spent_units ?? 0),
})

export async function listCustomers(ctx: Ctx) {
  const m = await requireMember(ctx, 'customers.view')
  const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 80).replace(/[%_\\]/g, '')
  const like = `%${q}%`
  const list = await rows<CustomerRow>(sql`
    SELECT c.*, (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id) AS order_count,
      (SELECT COALESCE(sum(o.total_units), 0) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS spent_units
    FROM customers c WHERE c.workspace_id = ${m.workspace.id} AND (${q} = '' OR c.name ILIKE ${like} OR c.email ILIKE ${like})
    ORDER BY c.created_at DESC LIMIT 200`)
  return { customers: list.map(customerDto) }
}

export async function getCustomer(ctx: Ctx) {
  const m = await requireMember(ctx, 'customers.view')
  const id = ctx.params.cid ?? ''
  if (!isUuid(id)) throw notFound('Customer not found.')
  const found = await rows<CustomerRow>(sql`
    SELECT c.*, (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id) AS order_count,
      (SELECT COALESCE(sum(o.total_units), 0) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS spent_units
    FROM customers c WHERE c.id = ${id} AND c.workspace_id = ${m.workspace.id}`)
  if (!found[0]) throw notFound('Customer not found.')
  const orders = await rows<OrderRow>(sql`SELECT * FROM orders WHERE customer_id = ${id} ORDER BY created_at DESC LIMIT 50`)
  return { customer: customerDto(found[0]), orders: orders.map(orderDto) }
}

export async function createCustomer(ctx: Ctx) {
  const m = await requireMember(ctx, 'customers.manage')
  const c = parseCustomer(asBody(await ctx.body()))
  try {
    const r = await rows<{ id: string }>(sql`
      INSERT INTO customers (workspace_id, name, email, phone, country, address_line1, address_line2, city, region, postal_code)
      VALUES (${m.workspace.id}, ${c.name}, ${c.email}, ${c.phone}, ${c.country}, ${c.addressLine1}, ${c.addressLine2}, ${c.city}, ${c.region}, ${c.postalCode})
      RETURNING id`)
    await audit(ctx, m.workspace.id, 'customer.created', { type: 'customer', id: r[0]!.id })
    return { id: r[0]!.id }
  } catch {
    throw conflict('A customer with that email already exists.')
  }
}

export async function updateCustomer(ctx: Ctx) {
  const m = await requireMember(ctx, 'customers.manage')
  const id = ctx.params.cid ?? ''
  if (!isUuid(id)) throw notFound('Customer not found.')
  const body = asBody(await ctx.body())
  const c = parseCustomer(body)
  const notes = str(body, 'notes', { max: 2000, optional: true })
  let updated: { id: string }[]
  try {
    updated = await rows<{ id: string }>(sql`
      UPDATE customers SET name = ${c.name}, email = ${c.email}, phone = ${c.phone}, country = ${c.country}, address_line1 = ${c.addressLine1},
        address_line2 = ${c.addressLine2}, city = ${c.city}, region = ${c.region}, postal_code = ${c.postalCode}, notes = ${notes}
      WHERE id = ${id} AND workspace_id = ${m.workspace.id} RETURNING id`)
  } catch {
    throw conflict('Another customer already uses that email.')
  }
  if (!updated[0]) throw notFound('Customer not found.')
  await audit(ctx, m.workspace.id, 'customer.updated', { type: 'customer', id })
  return { ok: true }
}

export async function deleteCustomer(ctx: Ctx) {
  const m = await requireMember(ctx, 'customers.manage')
  const id = ctx.params.cid ?? ''
  if (!isUuid(id)) throw notFound('Customer not found.')
  if (m.role === 'support') throw forbidden('Support members cannot delete customers.')
  await sql`DELETE FROM customers WHERE id = ${id} AND workspace_id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'customer.deleted', { type: 'customer', id })
  return { ok: true }
}

// ---------- invoices ----------
export async function createInvoice(ctx: Ctx) {
  const m = await requireMember(ctx, 'invoices.manage')
  const o = await loadOrder(m.workspace.id, ctx.params.oid ?? '')
  if (o.status === 'cancelled') throw conflict('Cancelled orders cannot be invoiced.')
  const existing = await rows<{ id: string }>(sql`SELECT id FROM invoices WHERE order_id = ${o.id}`)
  if (existing[0]) return { id: existing[0].id }
  const created = await sql.begin(async (tx) => {
    const n = await nextNumber(tx, m.workspace.id, 'invoice')
    const number = `INV-${n.toString().padStart(6, '0')}`
    const r = await rows<{ id: string }>(tx`
      INSERT INTO invoices (workspace_id, order_id, public_id, number, amount_units, due_at)
      VALUES (${m.workspace.id}, ${o.id}, ${publicId()}, ${number}, ${String(big(o.total_units))}, now() + interval '14 days')
      ON CONFLICT (order_id) DO NOTHING RETURNING id`)
    if (r[0]) await tx`INSERT INTO order_events (order_id, kind, detail, user_id) VALUES (${o.id}, 'invoice', ${`Invoice ${number} issued`}, ${m.user.id})`
    return r[0]?.id ?? null
  })
  if (!created) {
    const again = await rows<{ id: string }>(sql`SELECT id FROM invoices WHERE order_id = ${o.id}`)
    return { id: again[0]!.id }
  }
  await audit(ctx, m.workspace.id, 'invoice.created', { type: 'invoice', id: created })
  return { id: created }
}

async function invoiceView(where: { id?: string; workspaceId?: string; publicId?: string }) {
  const found = await rows<{
    id: string; number: string; public_id: string; status: string; amount_units: unknown; issued_at: Date; due_at: Date; order_id: string
    workspace_id: string
  }>(where.publicId
    ? sql`SELECT i.* FROM invoices i JOIN workspaces w ON w.id = i.workspace_id WHERE i.public_id = ${where.publicId} AND w.deleted_at IS NULL`
    : sql`SELECT * FROM invoices WHERE id = ${where.id!} AND workspace_id = ${where.workspaceId!}`)
  const inv = found[0]
  if (!inv) throw notFound('Invoice not found.')
  const o = (await rows<OrderRow>(sql`SELECT * FROM orders WHERE id = ${inv.order_id}`))[0]!
  const items = await rows<{ name: string; unit_price_units: unknown; quantity: number; line_total_units: unknown }>(sql`
    SELECT name, unit_price_units, quantity, line_total_units FROM order_items WHERE order_id = ${o.id} ORDER BY name`)
  const pay = (await rows<{ invoice_ref: string; status: string }>(sql`SELECT invoice_ref, status FROM payments WHERE order_id = ${o.id}`))[0]
  const w = (await rows<{ name: string; legal_name: string | null; address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string; support_email: string | null; phone: string | null }>(sql`
    SELECT name, legal_name, address_line1, address_line2, city, region, postal_code, country, support_email, phone FROM workspaces WHERE id = ${inv.workspace_id}`))[0]!
  return {
    invoice: {
      id: inv.id, number: inv.number, publicId: inv.public_id, status: inv.status, amount: usd(inv.amount_units), issuedAt: inv.issued_at, dueAt: inv.due_at,
      paymentStatus: o.payment_status, orderNumber: String(big(o.number)), orderId: o.id, orderPublicId: o.public_id, paymentReference: pay?.invoice_ref ?? null,
      subtotal: usd(o.subtotal_units), discount: usd(o.discount_units), total: usd(o.total_units), discountCode: o.discount_code,
      items: items.map((i) => ({ name: i.name, unitPrice: usd(i.unit_price_units), quantity: i.quantity, lineTotal: usd(i.line_total_units) })),
      customer: { name: o.customer_name, email: o.customer_email, shipTo: o.ship_to },
      business: {
        name: w.legal_name || w.name, tradingName: w.name, addressLine1: w.address_line1, addressLine2: w.address_line2, city: w.city,
        region: w.region, postalCode: w.postal_code, country: w.country, supportEmail: w.support_email, phone: w.phone,
      },
    },
  }
}

export async function getInvoice(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  const id = ctx.params.vid ?? ''
  if (!isUuid(id)) throw notFound('Invoice not found.')
  return invoiceView({ id, workspaceId: m.workspace.id })
}

export async function getPublicInvoice(ctx: Ctx) {
  const id = ctx.params.pubid ?? ''
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) throw notFound('Invoice not found.')
  return invoiceView({ publicId: id })
}

export async function listInvoices(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  const list = await rows<{ id: string; number: string; status: string; amount_units: unknown; issued_at: Date; due_at: Date; order_number: unknown; customer_name: string; payment_status: string }>(sql`
    SELECT i.id, i.number, i.status, i.amount_units, i.issued_at, i.due_at, o.number AS order_number, o.customer_name, o.payment_status
    FROM invoices i JOIN orders o ON o.id = i.order_id WHERE i.workspace_id = ${m.workspace.id} ORDER BY i.issued_at DESC LIMIT 200`)
  return {
    invoices: list.map((i) => ({
      id: i.id, number: i.number, status: i.status, amount: usd(i.amount_units), issuedAt: i.issued_at, dueAt: i.due_at,
      orderNumber: String(big(i.order_number)), customerName: i.customer_name, paymentStatus: i.payment_status,
    })),
  }
}

// ---------- sales summary (offchain order records) ----------
export async function salesSummary(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  const days = Math.min(90, Math.max(7, Number(ctx.url.searchParams.get('days') ?? 30) || 30))
  const totals = await rows<{ total: number; pending: number; processing: number; fulfilled: number; cancelled: number; value: unknown; fulfilled_value: unknown }>(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'processing')::int AS processing,
      count(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COALESCE(sum(total_units) FILTER (WHERE status <> 'cancelled'), 0) AS value,
      COALESCE(sum(total_units) FILTER (WHERE status = 'fulfilled'), 0) AS fulfilled_value
    FROM orders WHERE workspace_id = ${m.workspace.id}`)
  const series = await rows<{ day: string; orders: number; value: unknown }>(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(o.id)::int AS orders, COALESCE(sum(o.total_units) FILTER (WHERE o.status <> 'cancelled'), 0) AS value
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') AS d(day)
    LEFT JOIN orders o ON o.workspace_id = ${m.workspace.id} AND o.created_at::date = d.day::date
    GROUP BY d.day ORDER BY d.day`)
  const top = await rows<{ name: string; quantity: unknown; revenue: unknown }>(sql`
    SELECT i.name, sum(i.quantity) AS quantity, sum(i.line_total_units) AS revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.workspace_id = ${m.workspace.id} AND o.status <> 'cancelled'
    GROUP BY i.name ORDER BY sum(i.line_total_units) DESC LIMIT 5`)
  const t = totals[0]!
  return {
    source: 'offchain-order-records',
    totals: { orders: t.total, pending: t.pending, processing: t.processing, fulfilled: t.fulfilled, cancelled: t.cancelled, orderValue: usd(t.value), fulfilledValue: usd(t.fulfilled_value) },
    series: series.map((s) => ({ day: s.day, orders: s.orders, value: usd(s.value) })),
    topProducts: top.map((p) => ({ name: p.name, quantity: String(big(p.quantity)), revenue: usd(p.revenue) })),
  }
}
