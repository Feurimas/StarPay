/* oxlint-disable no-explicit-any -- tests read loosely typed JSON responses */
import { beforeAll, describe, expect, test } from 'bun:test'
import { migrate, sql } from './db'
import { csvCell } from './insights'
import { handle } from './index'
import { addMember, client, customer, owner, run, type Client } from './test-util'

beforeAll(async () => {
  for (const k of ['AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL']) delete process.env[k]
  await migrate()
})

async function shop(label: string) {
  const o = await owner(label)
  const base = `/workspaces/${o.wid}`
  const slug = `${label}-${run}`.toLowerCase()
  const created = await o.c.call('POST', `${base}/products`, { name: 'Ceramic mug', description: 'A mug', price: '10', status: 'active', trackInventory: true, stock: 4 })
  expect(created.status).toBe(200)
  const product = { id: created.data.id as string }
  expect((await o.c.call('PUT', `${base}/storefront`, { slug, title: 'Shop', tagline: '', description: '', published: true })).status).toBe(200)
  return { ...o, base, slug, product }
}

const getCsv = (c: Client, path: string) => handle(new Request(`http://test${path}`, { headers: { cookie: c.cookie } }))

const buy = (slug: string, productId: string, quantity: number, n: number, extra: Record<string, unknown> = {}) =>
  client().call('POST', `/public/stores/${slug}/orders`, { items: [{ productId, quantity }], customer: customer(n, extra) })

describe('insights', () => {
  test('an empty workspace shows zeros and no invented figures', async () => {
    const s = await shop('insempty')
    const r = await s.c.call('GET', `${s.base}/insights?days=30`)
    expect(r.status).toBe(200)
    expect(r.data.metrics.orders.value).toBe(0)
    expect(r.data.metrics.sales.value).toBe('0')
    expect(r.data.metrics.verifiedPayments).toMatchObject({ count: 0, value: '0', source: 'onchain' })
    expect(r.data.metrics.projectedMonthlySales.value).toBe('0')
    expect(r.data.metrics.verifiedShare.value).toBeNull()
    expect(r.data.series).toHaveLength(30)
    expect(r.data.products).toEqual([])
    expect(r.data.recentPayments).toEqual([])
  })

  test('every figure comes from real records and carries its source', async () => {
    const s = await shop('insreal')
    const a = (await buy(s.slug, s.product.id, 2, 1)).data // 20
    const b = (await buy(s.slug, s.product.id, 1, 2)).data // 10 (will be cancelled)
    await buy(s.slug, s.product.id, 1, 1) // 10, same customer again
    const orders = (await s.c.call('GET', `${s.base}/orders`)).data.orders
    const bId = orders.find((x: any) => x.number === b.number)!.id
    expect((await s.c.call('PATCH', `${s.base}/orders/${bId}/status`, { status: 'cancelled' })).status).toBe(200)
    const aId = orders.find((x: any) => x.number === a.number)!.id
    await s.c.call('PATCH', `${s.base}/orders/${aId}/status`, { status: 'processing' })
    await s.c.call('PATCH', `${s.base}/orders/${aId}/status`, { status: 'fulfilled' })

    const r = (await s.c.call('GET', `${s.base}/insights?days=7`)).data
    expect(r.days).toBe(7)
    expect(r.metrics.orders).toMatchObject({ value: 3, source: 'offchain' })
    expect(r.metrics.sales).toMatchObject({ value: '30', source: 'offchain' }) // 20 + 10, the cancelled order excluded
    expect(r.metrics.completedOrders.value).toBe(1)
    expect(r.metrics.cancelledOrders.value).toBe(1)
    expect(r.metrics.openOrders.value).toBe(1)
    expect(r.metrics.awaitingPayment).toMatchObject({ count: 2, value: '30', source: 'offchain' })
    // nothing was paid onchain, so nothing is shown as verified
    expect(r.metrics.verifiedPayments).toMatchObject({ count: 0, value: '0', source: 'onchain' })
    expect(r.metrics.verifiedShare).toMatchObject({ value: 0, source: 'mixed' })
    expect(r.metrics.projectedMonthlySales).toMatchObject({ value: '128.571428', source: 'estimate' }) // 30 USDC / 7 days * 30
    expect(r.series.reduce((n: number, d: any) => n + d.orders, 0)).toBe(3)
    expect(r.products[0]).toEqual({ name: 'Ceramic mug', units: '3', revenue: '30' })
    expect(r.customers.active).toBe(1)
    expect(r.customers.returning).toBe(1) // the same customer ordered twice
    expect(r.customers.top[0]).toMatchObject({ orders: 2, value: '30' })
    expect(r.lowStock[0]).toMatchObject({ name: 'Ceramic mug', stock: 1 })
  })

  test('verified payments are counted from payment records and shown as onchain', async () => {
    const s = await shop('inspay')
    const order = (await buy(s.slug, s.product.id, 1, 1)).data
    const orders = (await s.c.call('GET', `${s.base}/orders`)).data.orders
    const oid = orders.find((x: any) => x.number === order.number)!.id
    const ref = `0x${run.padEnd(64, 'a')}`
    const hash = `0x${run.padEnd(64, 'b')}`
    // a verified payment row, as the verification step would leave it
    await sql`
      INSERT INTO payments (workspace_id, order_id, invoice_ref, merchant_address, amount_units, chain_id, router_address, status, payer_address, tx_hash, block_number, confirmed_at, start_block)
      VALUES (${s.wid}, ${oid}, ${ref}, '0x0000000000000000000000000000000000000001', 10000000, 5042002, '0x0000000000000000000000000000000000000002', 'confirmed', '0x0000000000000000000000000000000000000003', ${hash}, 1, now(), 1)`
    const r = (await s.c.call('GET', `${s.base}/insights?days=30`)).data
    expect(r.metrics.verifiedPayments).toMatchObject({ count: 1, value: '10', source: 'onchain' })
    expect(r.metrics.verifiedShare.value).toBe(100)
    expect(r.recentPayments[0]).toMatchObject({ orderNumber: String(order.number), amount: '10', txHash: hash })
    expect(r.recentPayments[0].explorerUrl).toContain(`/tx/${hash}`)
    expect(r.series.at(-1).verified).toBe('10')
  })

  test('periods are limited to 7, 30 or 90 days', async () => {
    const s = await shop('insdays')
    expect((await s.c.call('GET', `${s.base}/insights?days=90`)).data.days).toBe(90)
    expect((await s.c.call('GET', `${s.base}/insights?days=1000`)).data.days).toBe(30)
    expect((await s.c.call('GET', `${s.base}/insights?days=abc`)).data.days).toBe(30)
  })

  test('other organizations and signed-out visitors cannot read insights or reports', async () => {
    const s = await shop('insiso')
    const other = await owner('insother')
    for (const path of [`${s.base}/insights`, `${s.base}/reports/orders`, `${s.base}/reports/payments`, `${s.base}/reports/products`]) {
      expect((await other.c.call('GET', path)).status).toBe(404)
      expect((await client().call('GET', path)).status).toBe(401)
    }
    const viewer = await addMember(s, 'insviewer', 'viewer')
    expect((await viewer.c.call('GET', `${s.base}/insights`)).status).toBe(200)
    expect((await viewer.c.call('GET', `${s.base}/reports/orders`)).status).toBe(200)
  })
})

describe('csv reports', () => {
  test('exports real rows, labels the payment column, and is audit logged', async () => {
    const s = await shop('inscsv')
    await buy(s.slug, s.product.id, 1, 1)
    const res = await getCsv(s.c, `${s.base}/reports/orders?days=30`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const text = await res.text()
    expect(text).toContain('Payment status (verified onchain)')
    expect(text.trim().split('\r\n')).toHaveLength(2) // header and one order
    const audit = (await s.c.call('GET', `${s.base}/audit`)).data.entries ?? []
    expect(JSON.stringify(audit)).toContain('report.exported')
    expect((await s.c.call('GET', `${s.base}/reports/nonsense`)).status).toBe(404)
  })

  test('spreadsheet formulas in customer names are defused', async () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvCell('+1+1')).toBe(`"'+1+1"`)
    expect(csvCell('-2')).toBe(`"'-2"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCell('plain, with comma')).toBe('"plain, with comma"')
    expect(csvCell(null)).toBe('""')
    const s = await shop('inscsv2')
    await buy(s.slug, s.product.id, 1, 1, { name: '=cmd|"/c calc"!A1' })
    const text = await (await getCsv(s.c, `${s.base}/reports/orders`)).text()
    expect(text).toContain(`"'=cmd|""/c calc""!A1"`)
    expect(text).not.toContain(`,"=cmd`)
  })
})
