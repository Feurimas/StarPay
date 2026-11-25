import { randomBytes } from 'node:crypto'
import type { SQL, TransactionSQL } from 'bun'
import { rows, sql } from './db'
import { badRequest, conflict, isUuid } from './http'
import { big, discountAmount } from './money'

export type Tx = TransactionSQL
type Db = SQL | TransactionSQL

export interface CartInput {
  productId: string
  quantity: number
}

export interface PricedLine {
  productId: string
  name: string
  unitUnits: bigint
  quantity: number
  lineUnits: bigint
  imageId: string | null
}

export interface PricedCart {
  lines: PricedLine[]
  subtotal: bigint
  discountCode: string | null
  discountId: string | null
  discountUnits: bigint
  total: bigint
}

export interface CustomerInput {
  name: string
  email: string
  phone: string | null
  country: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
}

export const publicId = () => randomBytes(16).toString('base64url')

export function parseCart(raw: unknown): CartInput[] {
  if (!Array.isArray(raw) || raw.length === 0) throw badRequest('Your cart is empty.')
  if (raw.length > 50) throw badRequest('A cart can hold up to 50 different products.')
  const merged = new Map<string, number>()
  for (const entry of raw) {
    const item = entry as { productId?: unknown; quantity?: unknown }
    if (typeof item?.productId !== 'string' || !isUuid(item.productId)) throw badRequest('A cart item is not valid.')
    const qty = item.quantity
    // Strictly a JSON number: Number() would also accept "2", " 3 ", true and [5].
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 100) throw badRequest('Quantity must be a whole number from 1 to 100.')
    merged.set(item.productId, Math.min(100, (merged.get(item.productId) ?? 0) + qty))
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }))
}

interface ProductPriceRow {
  id: string
  name: string
  price_units: unknown
  track_inventory: boolean
  stock: number
  status: string
  image_id: string | null
}

/**
 * Prices a cart from the database. The client never supplies a price: names, unit prices,
 * stock and discount rules are all read here, so a tampered request cannot change what is charged.
 */
export async function priceCart(db: Db, workspaceId: string, items: CartInput[], discountCode?: string | null): Promise<PricedCart> {
  const ids = items.map((i) => i.productId)
  const found = await rows<ProductPriceRow>(db`
    SELECT p.id, p.name, p.price_units, p.track_inventory, p.stock, p.status,
      (SELECT i.id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.created_at LIMIT 1) AS image_id
    FROM products p WHERE p.workspace_id = ${workspaceId} AND p.id IN ${db(ids)}`)
  const byId = new Map(found.map((p) => [p.id, p]))
  const lines: PricedLine[] = []
  for (const item of items) {
    const p = byId.get(item.productId)
    if (!p || p.status !== 'active') throw conflict('An item in your cart is no longer available. Remove it and try again.')
    if (p.track_inventory && p.stock < item.quantity) {
      throw conflict(p.stock === 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} left.`)
    }
    const unit = big(p.price_units)
    lines.push({ productId: p.id, name: p.name, unitUnits: unit, quantity: item.quantity, lineUnits: unit * BigInt(item.quantity), imageId: p.image_id })
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineUnits, 0n)
  let discountUnits = 0n
  let discountId: string | null = null
  let code: string | null = null
  const wanted = discountCode?.trim().toUpperCase()
  if (wanted) {
    const d = await rows<{ id: string; code: string; kind: string; value: unknown; min_subtotal_units: unknown; max_uses: number | null; used_count: number }>(db`
      SELECT id, code, kind, value, min_subtotal_units, max_uses, used_count FROM discounts
      WHERE workspace_id = ${workspaceId} AND upper(code) = ${wanted} AND active
        AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())`)
    const row = d[0]
    if (!row || (row.max_uses !== null && row.used_count >= row.max_uses)) throw badRequest('That discount code is not valid.')
    if (subtotal < big(row.min_subtotal_units)) throw badRequest('Your order is below the minimum for that discount code.')
    discountUnits = discountAmount(row.kind, big(row.value), subtotal)
    discountId = row.id
    code = row.code
  }
  return { lines, subtotal, discountCode: code, discountId, discountUnits, total: subtotal - discountUnits }
}

export async function nextNumber(tx: Tx, workspaceId: string, kind: string): Promise<bigint> {
  const r = await rows<{ value: unknown }>(tx`
    INSERT INTO workspace_counters (workspace_id, kind, value) VALUES (${workspaceId}, ${kind}, 1)
    ON CONFLICT (workspace_id, kind) DO UPDATE SET value = workspace_counters.value + 1
    RETURNING value`)
  return big(r[0]!.value)
}

/** Creates the order, reserves stock and records the discount use in one transaction. */
export async function createOrder(
  workspaceId: string,
  items: CartInput[],
  customer: CustomerInput,
  discountCode: string | null,
  notes: string,
  actorId: string | null,
): Promise<{ id: string; publicId: string; number: string; total: bigint }> {
  return sql.begin(async (tx) => {
    const cart = await priceCart(tx, workspaceId, items, discountCode)
    for (const line of cart.lines) {
      const ok = await rows<{ id: string }>(tx`
        UPDATE products SET stock = CASE WHEN track_inventory THEN stock - ${line.quantity} ELSE stock END, updated_at = now()
        WHERE id = ${line.productId} AND workspace_id = ${workspaceId} AND status = 'active'
          AND (NOT track_inventory OR stock >= ${line.quantity}) RETURNING id`)
      if (!ok[0]) throw conflict(`${line.name} just sold out. Update your cart and try again.`)
    }
    if (cart.discountId) {
      const ok = await rows<{ id: string }>(tx`
        UPDATE discounts SET used_count = used_count + 1 WHERE id = ${cart.discountId}
          AND (max_uses IS NULL OR used_count < max_uses) RETURNING id`)
      if (!ok[0]) throw badRequest('That discount code has been fully used.')
    }
    const cust = await rows<{ id: string }>(tx`
      INSERT INTO customers (workspace_id, name, email, phone, country, address_line1, address_line2, city, region, postal_code)
      VALUES (${workspaceId}, ${customer.name}, ${customer.email}, ${customer.phone}, ${customer.country}, ${customer.addressLine1},
              ${customer.addressLine2}, ${customer.city}, ${customer.region}, ${customer.postalCode})
      ON CONFLICT (workspace_id, lower(email)) DO UPDATE SET
        name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone), country = COALESCE(EXCLUDED.country, customers.country),
        address_line1 = COALESCE(EXCLUDED.address_line1, customers.address_line1), address_line2 = COALESCE(EXCLUDED.address_line2, customers.address_line2),
        city = COALESCE(EXCLUDED.city, customers.city), region = COALESCE(EXCLUDED.region, customers.region),
        postal_code = COALESCE(EXCLUDED.postal_code, customers.postal_code)
      RETURNING id`)
    const number = await nextNumber(tx, workspaceId, 'order')
    const pid = publicId()
    const shipTo = {
      country: customer.country, addressLine1: customer.addressLine1, addressLine2: customer.addressLine2,
      city: customer.city, region: customer.region, postalCode: customer.postalCode, phone: customer.phone,
    }
    const order = await rows<{ id: string }>(tx`
      INSERT INTO orders (workspace_id, public_id, number, customer_id, customer_name, customer_email, ship_to,
                          subtotal_units, discount_units, total_units, discount_code, notes)
      VALUES (${workspaceId}, ${pid}, ${number.toString()}, ${cust[0]!.id}, ${customer.name}, ${customer.email},
              ${JSON.stringify(shipTo)}::text::jsonb, ${cart.subtotal.toString()}, ${cart.discountUnits.toString()},
              ${cart.total.toString()}, ${cart.discountCode}, ${notes}) RETURNING id`)
    for (const l of cart.lines) {
      await tx`
        INSERT INTO order_items (order_id, product_id, name, unit_price_units, quantity, line_total_units)
        VALUES (${order[0]!.id}, ${l.productId}, ${l.name}, ${l.unitUnits.toString()}, ${l.quantity}, ${l.lineUnits.toString()})`
    }
    await tx`INSERT INTO order_events (order_id, kind, detail, user_id) VALUES (${order[0]!.id}, 'created', ${actorId ? 'Created by the business' : 'Placed at checkout'}, ${actorId})`
    return { id: order[0]!.id, publicId: pid, number: number.toString(), total: cart.total }
  })
}
