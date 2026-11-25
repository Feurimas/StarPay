import { emitEvent } from './workflowEngine'
import type { Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, country, email, isUuid, notFound, rateLimit, str } from './http'
import { big, usd } from './money'
import { createOrder, parseCart, priceCart, type CustomerInput, type PricedCart } from './ordering'

interface StorefrontRow {
  workspace_id: string
  slug: string
  title: string
  tagline: string
  description: string
  workspace_name: string
  support_email: string | null
  country: string
}

async function loadStorefront(slug: string): Promise<StorefrontRow> {
  const found = await rows<StorefrontRow>(sql`
    SELECT s.workspace_id, s.slug, s.title, s.tagline, s.description, w.name AS workspace_name, w.support_email, w.country
    FROM storefronts s JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.slug = ${slug} AND s.published AND w.deleted_at IS NULL`)
  if (!found[0]) throw notFound('This store is not available.')
  return found[0]
}

const availability = (track: boolean, stock: number) => (!track ? 'in_stock' : stock <= 0 ? 'out' : stock <= 5 ? 'low' : 'in_stock')

export const cartDto = (c: PricedCart) => ({
  lines: c.lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    unitPrice: usd(l.unitUnits),
    quantity: l.quantity,
    lineTotal: usd(l.lineUnits),
    imageId: l.imageId,
  })),
  subtotal: usd(c.subtotal),
  discountCode: c.discountCode,
  discount: usd(c.discountUnits),
  total: usd(c.total),
})

export async function getStore(ctx: Ctx) {
  const store = await loadStorefront(ctx.params.slug ?? '')
  const products = await rows<{
    id: string; name: string; description: string; price_units: unknown; category_id: string | null
    track_inventory: boolean; stock: number; image_id: string | null
  }>(sql`
    SELECT p.id, p.name, p.description, p.price_units, p.category_id, p.track_inventory, p.stock,
      (SELECT i.id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.created_at LIMIT 1) AS image_id
    FROM products p WHERE p.workspace_id = ${store.workspace_id} AND p.status = 'active' ORDER BY p.created_at DESC`)
  const categories = await rows<{ id: string; name: string }>(sql`
    SELECT DISTINCT c.id, c.name FROM categories c JOIN products p ON p.category_id = c.id
    WHERE c.workspace_id = ${store.workspace_id} AND p.status = 'active' ORDER BY c.name`)
  return {
    store: { slug: store.slug, title: store.title, tagline: store.tagline, description: store.description, businessName: store.workspace_name, supportEmail: store.support_email },
    categories,
    products: products.map((p) => ({
      id: p.id, name: p.name, description: p.description, price: usd(p.price_units), categoryId: p.category_id,
      imageId: p.image_id, availability: availability(p.track_inventory, p.stock),
    })),
  }
}

export async function getStoreProduct(ctx: Ctx) {
  const store = await loadStorefront(ctx.params.slug ?? '')
  const pid = ctx.params.pid ?? ''
  if (!isUuid(pid)) throw notFound('Product not found.')
  const found = await rows<{ id: string; name: string; description: string; price_units: unknown; track_inventory: boolean; stock: number; category_name: string | null }>(sql`
    SELECT p.id, p.name, p.description, p.price_units, p.track_inventory, p.stock, c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ${pid} AND p.workspace_id = ${store.workspace_id} AND p.status = 'active'`)
  const p = found[0]
  if (!p) throw notFound('Product not found.')
  const images = await rows<{ id: string }>(sql`SELECT id FROM product_images WHERE product_id = ${pid} ORDER BY position, created_at`)
  return {
    store: { slug: store.slug, title: store.title },
    product: {
      id: p.id, name: p.name, description: p.description, price: usd(p.price_units), categoryName: p.category_name,
      availability: availability(p.track_inventory, p.stock), remaining: p.track_inventory && p.stock <= 5 ? p.stock : null,
      imageIds: images.map((i) => i.id),
    },
  }
}

export async function quote(ctx: Ctx) {
  rateLimit(`quote:${ctx.ip}`, 120, 15 * 60_000)
  const store = await loadStorefront(ctx.params.slug ?? '')
  const body = asBody(await ctx.body())
  const code = str(body, 'discountCode', { max: 30, optional: true })
  return { cart: cartDto(await priceCart(sql, store.workspace_id, parseCart(body.items), code || null)) }
}

async function restrictedCountry(code: string | null): Promise<boolean> {
  if (!code) return false
  const r = await rows<{ code: string }>(sql`SELECT code FROM restricted_countries WHERE code = ${code}`)
  return r.length > 0
}

export function parseCustomer(body: Record<string, unknown>): CustomerInput {
  const opt = (key: string, max: number) => str(body, key, { max, optional: true }) || null
  const phone = opt('phone', 40)
  if (phone && !/^\+?[0-9 ().-]{6,40}$/.test(phone)) throw badRequest('Enter a valid phone number, for example +1 415 555 0100.')
  return {
    name: str(body, 'name', { min: 2, max: 100 }),
    email: email(body),
    phone,
    country: country(body, 'country', true) || null,
    addressLine1: opt('addressLine1', 200),
    addressLine2: opt('addressLine2', 200),
    city: opt('city', 80),
    region: opt('region', 80),
    postalCode: opt('postalCode', 20),
  }
}

export async function checkout(ctx: Ctx) {
  rateLimit(`checkout:${ctx.ip}`, 10, 60 * 60_000)
  const store = await loadStorefront(ctx.params.slug ?? '')
  const body = asBody(await ctx.body())
  const customer = parseCustomer(asBody(body.customer))
  if (!customer.country) throw badRequest('Choose your country.')
  if (await restrictedCountry(customer.country)) throw badRequest('Orders from this country are not available.')
  const notes = str(body, 'notes', { max: 500, optional: true })
  const code = str(body, 'discountCode', { max: 30, optional: true })
  const order = await createOrder(store.workspace_id, parseCart(body.items), customer, code || null, notes, null)
  emitEvent(store.workspace_id, 'order.created', { orderId: order.id })
  return { publicId: order.publicId, number: order.number, total: usd(order.total) }
}

export async function getPublicOrder(ctx: Ctx) {
  const id = ctx.params.oid ?? ''
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) throw notFound('Order not found.')
  const found = await rows<{
    id: string; number: unknown; status: string; payment_status: string; subtotal_units: unknown; discount_units: unknown
    total_units: unknown; discount_code: string | null; created_at: Date; workspace_id: string; customer_name: string
  }>(sql`
    SELECT o.id, o.number, o.status, o.payment_status, o.subtotal_units, o.discount_units, o.total_units, o.discount_code,
           o.created_at, o.workspace_id, o.customer_name
    FROM orders o JOIN workspaces w ON w.id = o.workspace_id WHERE o.public_id = ${id} AND w.deleted_at IS NULL`)
  const o = found[0]
  if (!o) throw notFound('Order not found.')
  const items = await rows<{ name: string; unit_price_units: unknown; quantity: number; line_total_units: unknown }>(sql`
    SELECT name, unit_price_units, quantity, line_total_units FROM order_items WHERE order_id = ${o.id} ORDER BY name`)
  const store = await rows<{ slug: string; title: string; published: boolean }>(sql`SELECT slug, title, published FROM storefronts WHERE workspace_id = ${o.workspace_id}`)
  const invoice = await rows<{ public_id: string }>(sql`SELECT public_id FROM invoices WHERE order_id = ${o.id} AND status = 'issued'`)
  return {
    order: {
      number: String(big(o.number)), status: o.status, paymentStatus: o.payment_status, customerName: o.customer_name,
      subtotal: usd(o.subtotal_units), discount: usd(o.discount_units), total: usd(o.total_units), discountCode: o.discount_code,
      createdAt: o.created_at, invoiceId: invoice[0]?.public_id ?? null,
      items: items.map((i) => ({ name: i.name, unitPrice: usd(i.unit_price_units), quantity: i.quantity, lineTotal: usd(i.line_total_units) })),
    },
    store: store[0] ? { slug: store[0].slug, title: store[0].title, published: store[0].published } : null,
  }
}
