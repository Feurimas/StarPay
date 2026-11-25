import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { big, usd } from './money'
import { CHAIN_ID } from './chain'
import { buildTxExplorerUrl } from '@/onchain-facts'

/**
 * StarPay Insights. Every figure here is computed from stored records, never invented.
 * Each metric carries its source so the interface can say what is proven onchain and what is a business record:
 *   onchain  = payments the server verified on Arc Testnet
 *   offchain = orders, customers and products stored in StarPay
 *   mixed    = a ratio of one onchain and one offchain figure
 *   estimate = a simple projection from the figures above, not a forecast
 * Days are UTC calendar days.
 */
export type Source = 'onchain' | 'offchain' | 'mixed' | 'estimate'

const PERIODS = [7, 30, 90]
function period(ctx: Ctx): number {
  const days = Number(ctx.url.searchParams.get('days') ?? 30)
  return PERIODS.includes(days) ? days : 30
}

/** Change versus the previous period of the same length: a whole-number percentage, or null when there is no base. */
function change(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null
  return Number(((current - previous) * 1000n) / previous) / 10
}

interface OrderAgg {
  orders: number
  prev_orders: number
  open_orders: number
  fulfilled: number
  cancelled: number
  sales: unknown
  prev_sales: unknown
}
interface PayAgg {
  verified_count: number
  verified_units: unknown
  prev_verified_units: unknown
  pending_count: number
  pending_units: unknown
  awaiting_count: number
  awaiting_units: unknown
}

export async function insights(ctx: Ctx) {
  const m = await requireMember(ctx, 'orders.view')
  await requireMember(ctx, 'payments.view')
  const w = m.workspace.id
  const days = period(ctx)

  const [o] = await rows<OrderAgg>(sql`
    SELECT
      count(*) FILTER (WHERE age < ${days}::int)::int AS orders,
      count(*) FILTER (WHERE age >= ${days}::int AND age < ${days * 2}::int)::int AS prev_orders,
      count(*) FILTER (WHERE age < ${days}::int AND status IN ('pending','processing'))::int AS open_orders,
      count(*) FILTER (WHERE age < ${days}::int AND status = 'fulfilled')::int AS fulfilled,
      count(*) FILTER (WHERE age < ${days}::int AND status = 'cancelled')::int AS cancelled,
      COALESCE(sum(total_units) FILTER (WHERE age < ${days}::int AND status <> 'cancelled'), 0) AS sales,
      COALESCE(sum(total_units) FILTER (WHERE age >= ${days}::int AND age < ${days * 2}::int AND status <> 'cancelled'), 0) AS prev_sales
    FROM (SELECT status, total_units, (current_date - created_at::date) AS age FROM orders WHERE workspace_id = ${w}) x`)
  const [p] = await rows<PayAgg>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'confirmed' AND age < ${days}::int)::int AS verified_count,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'confirmed' AND age < ${days}::int), 0) AS verified_units,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'confirmed' AND age >= ${days}::int AND age < ${days * 2}::int), 0) AS prev_verified_units,
      count(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'pending'), 0) AS pending_units,
      count(*) FILTER (WHERE status = 'requested')::int AS awaiting_count,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'requested'), 0) AS awaiting_units
    FROM (SELECT status, amount_units, (current_date - COALESCE(confirmed_at, created_at)::date) AS age FROM payments WHERE workspace_id = ${w}) x`)
  const [unpaid] = await rows<{ count: number; units: unknown }>(sql`
    SELECT count(*)::int AS count, COALESCE(sum(total_units), 0) AS units FROM orders
    WHERE workspace_id = ${w} AND status <> 'cancelled' AND payment_status = 'unpaid' AND total_units > 0`)

  const series = await rows<{ day: string; orders: number; sales: unknown; verified: unknown; new_customers: number }>(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM orders o WHERE o.workspace_id = ${w} AND o.created_at::date = d.day::date)::int AS orders,
      (SELECT COALESCE(sum(o.total_units), 0) FROM orders o WHERE o.workspace_id = ${w} AND o.status <> 'cancelled' AND o.created_at::date = d.day::date) AS sales,
      (SELECT COALESCE(sum(p.amount_units), 0) FROM payments p WHERE p.workspace_id = ${w} AND p.status = 'confirmed' AND p.confirmed_at::date = d.day::date) AS verified,
      (SELECT count(*) FROM customers c WHERE c.workspace_id = ${w} AND c.created_at::date = d.day::date)::int AS new_customers
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') AS d(day)
    ORDER BY d.day`)

  const products = await rows<{ name: string; units: unknown; revenue: unknown }>(sql`
    SELECT i.name, sum(i.quantity) AS units, sum(i.line_total_units) AS revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.workspace_id = ${w} AND o.status <> 'cancelled' AND (current_date - o.created_at::date) < ${days}::int
    GROUP BY i.name ORDER BY sum(i.line_total_units) DESC, i.name LIMIT 8`)
  const lowStock = await rows<{ id: string; name: string; stock: number }>(sql`
    SELECT id, name, stock FROM products
    WHERE workspace_id = ${w} AND status = 'active' AND track_inventory AND stock <= 5 ORDER BY stock, name LIMIT 5`)

  const topCustomers = await rows<{ id: string; name: string; orders: number; value: unknown }>(sql`
    SELECT c.id, c.name, count(o.id)::int AS orders, COALESCE(sum(o.total_units), 0) AS value
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.workspace_id = ${w} AND o.status <> 'cancelled' AND (current_date - o.created_at::date) < ${days}::int
    GROUP BY c.id, c.name ORDER BY sum(o.total_units) DESC, c.name LIMIT 5`)
  const [cust] = await rows<{ active: number; returning: number; total: number }>(sql`
    SELECT
      count(DISTINCT o.customer_id) FILTER (WHERE (current_date - o.created_at::date) < ${days}::int)::int AS active,
      count(DISTINCT o.customer_id) FILTER (WHERE (current_date - o.created_at::date) < ${days}::int
        AND (SELECT count(*) FROM orders o2 WHERE o2.customer_id = o.customer_id AND o2.status <> 'cancelled') >= 2)::int AS returning,
      (SELECT count(*) FROM customers WHERE workspace_id = ${w})::int AS total
    FROM orders o WHERE o.workspace_id = ${w} AND o.status <> 'cancelled' AND o.customer_id IS NOT NULL`)

  const recent = await rows<{ order_number: unknown; amount_units: unknown; tx_hash: string; payer_address: string | null; confirmed_at: string }>(sql`
    SELECT o.number AS order_number, p.amount_units, p.tx_hash, p.payer_address, p.confirmed_at
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE p.workspace_id = ${w} AND p.status = 'confirmed' ORDER BY p.confirmed_at DESC LIMIT 8`)

  const sales = big(o!.sales)
  const verified = big(p!.verified_units)
  const verifiedShare = sales > 0n ? Math.min(100, Number((verified * 1000n) / sales) / 10) : null
  const projected = days >= 7 ? (sales * 30n) / BigInt(days) : null

  return {
    days,
    generatedAt: new Date().toISOString(),
    timezone: 'UTC',
    metrics: {
      orders: { value: o!.orders, change: change(BigInt(o!.orders), BigInt(o!.prev_orders)), source: 'offchain' as Source },
      sales: { value: usd(sales), change: change(sales, big(o!.prev_sales)), source: 'offchain' as Source },
      openOrders: { value: o!.open_orders, source: 'offchain' as Source },
      completedOrders: { value: o!.fulfilled, source: 'offchain' as Source },
      cancelledOrders: { value: o!.cancelled, source: 'offchain' as Source },
      verifiedPayments: { count: p!.verified_count, value: usd(verified), change: change(verified, big(p!.prev_verified_units)), source: 'onchain' as Source },
      pendingPayments: { count: p!.pending_count, value: usd(p!.pending_units), source: 'onchain' as Source },
      awaitingPayment: { count: unpaid!.count, value: usd(unpaid!.units), source: 'offchain' as Source },
      verifiedShare: { value: verifiedShare, source: 'mixed' as Source },
      projectedMonthlySales: { value: projected === null ? null : usd(projected), source: 'estimate' as Source },
    },
    series: series.map((s) => ({ day: s.day, orders: s.orders, sales: usd(s.sales), verified: usd(s.verified), newCustomers: s.new_customers })),
    products: products.map((x) => ({ name: x.name, units: String(big(x.units)), revenue: usd(x.revenue) })),
    lowStock,
    customers: {
      total: cust?.total ?? 0,
      active: cust?.active ?? 0,
      returning: cust?.returning ?? 0,
      top: topCustomers.map((c) => ({ id: c.id, name: c.name, orders: c.orders, value: usd(c.value) })),
    },
    recentPayments: recent.map((r) => ({
      orderNumber: String(big(r.order_number)), amount: usd(r.amount_units), txHash: r.tx_hash, payer: r.payer_address,
      confirmedAt: r.confirmed_at, explorerUrl: buildTxExplorerUrl(CHAIN_ID, r.tx_hash),
    })),
  }
}

// ---------- CSV reports ----------

/** Quotes a cell and defuses spreadsheet formulas (a cell starting with = + - @ would otherwise run as a formula). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function csvResponse(name: string, header: string[], data: unknown[][]): Response {
  const body = [header, ...data].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
  return new Response(`\uFEFF${body}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}

export async function exportCsv(ctx: Ctx) {
  const kind = ctx.params.kind
  const m = await requireMember(ctx, kind === 'payments' ? 'payments.view' : 'orders.view')
  const w = m.workspace.id
  const days = period(ctx)
  const stamp = new Date().toISOString().slice(0, 10)
  await audit(ctx, w, 'report.exported', { type: 'report', id: kind ?? '' }, { days })

  if (kind === 'orders') {
    const data = await rows<Record<string, unknown>>(sql`
      SELECT number, created_at, status, payment_status, customer_name, customer_email, subtotal_units, discount_units, total_units, discount_code
      FROM orders WHERE workspace_id = ${w} AND (current_date - created_at::date) < ${days}::int ORDER BY number`)
    return csvResponse(`starpay-orders-${stamp}.csv`,
      ['Order', 'Created (UTC)', 'Status', 'Payment status (verified onchain)', 'Customer', 'Email', 'Subtotal USDC', 'Discount USDC', 'Total USDC', 'Discount code'],
      data.map((r) => [String(big(r.number)), r.created_at, r.status, r.payment_status, r.customer_name, r.customer_email, usd(r.subtotal_units), usd(r.discount_units), usd(r.total_units), r.discount_code]))
  }
  if (kind === 'payments') {
    const data = await rows<Record<string, unknown>>(sql`
      SELECT o.number, p.status, p.amount_units, p.payer_address, p.merchant_address, p.tx_hash, p.block_number, p.confirmed_at, p.created_at
      FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.workspace_id = ${w} AND (current_date - COALESCE(p.confirmed_at, p.created_at)::date) < ${days}::int ORDER BY p.created_at`)
    return csvResponse(`starpay-payments-${stamp}.csv`,
      ['Order', 'Status', 'Amount USDC', 'Payer wallet', 'Merchant wallet', 'Transaction hash', 'Block', 'Verified at (UTC)', 'Requested at (UTC)'],
      data.map((r) => [String(big(r.number)), r.status, usd(r.amount_units), r.payer_address, r.merchant_address, r.tx_hash, r.block_number === null ? '' : String(big(r.block_number)), r.confirmed_at, r.created_at]))
  }
  if (kind === 'products') {
    const data = await rows<Record<string, unknown>>(sql`
      SELECT p.name, p.sku, p.status, p.price_units, p.track_inventory, p.stock,
        COALESCE(sum(i.quantity) FILTER (WHERE o.status <> 'cancelled' AND (current_date - o.created_at::date) < ${days}::int), 0) AS units,
        COALESCE(sum(i.line_total_units) FILTER (WHERE o.status <> 'cancelled' AND (current_date - o.created_at::date) < ${days}::int), 0) AS revenue
      FROM products p LEFT JOIN order_items i ON i.product_id = p.id LEFT JOIN orders o ON o.id = i.order_id
      WHERE p.workspace_id = ${w} GROUP BY p.id ORDER BY p.name`)
    return csvResponse(`starpay-products-${stamp}.csv`,
      ['Product', 'SKU', 'Status', 'Price USDC', 'Stock', 'Units sold', 'Revenue USDC (order records)'],
      data.map((r) => [r.name, r.sku, r.status, usd(r.price_units), r.track_inventory ? r.stock : 'not tracked', String(big(r.units)), usd(r.revenue)]))
  }
  return new Response(JSON.stringify({ error: { message: 'Unknown report.', code: 'not_found' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
}
