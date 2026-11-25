/* oxlint-disable no-explicit-any -- tests read loosely typed JSON responses */
import { beforeAll, describe, expect, test } from 'bun:test'
import { migrate } from './db'
import { addMember, client, customer, owner, PNG } from './test-util'

beforeAll(async () => {
  await migrate()
})

async function shop(label: string) {
  const o = await owner(label)
  const base = `/workspaces/${o.wid}`
  const product = async (name: string, price: string, extra: Record<string, unknown> = {}) => {
    const r = await o.c.call('POST', `${base}/products`, { name, description: `${name} description`, price, status: 'active', ...extra })
    expect(r.status).toBe(200)
    return r.data.id as string
  }
  const slug = `shop-${label}-${Math.random().toString(36).slice(2, 7)}`
  const publish = async () =>
    expect((await o.c.call('PUT', `${base}/storefront`, { slug, title: `${label} Store`, tagline: 'Hello', description: '', published: true })).status).toBe(200)
  return { ...o, base, product, slug, publish }
}

describe('catalog', () => {
  test('validates prices and enforces permissions and isolation', async () => {
    const s = await shop('cat')
    for (const price of ['abc', '1.1234567', '-5', '']) {
      expect((await s.c.call('POST', `${s.base}/products`, { name: 'Bad', price, status: 'draft' })).status).toBe(400)
    }
    expect((await s.c.call('POST', `${s.base}/products`, { name: 'Free active', price: '0', status: 'active' })).status).toBe(400)
    const id = await s.product('Mug', '12.50')
    const got = await s.c.call('GET', `${s.base}/products/${id}`)
    expect(got.data.product.price).toBe('12.5')

    const viewer = await addMember(s, 'catviewer', 'viewer')
    expect((await viewer.c.call('GET', `${s.base}/products`)).data.products.length).toBe(1)
    expect((await viewer.c.call('POST', `${s.base}/products`, { name: 'Nope', price: '1', status: 'draft' })).status).toBe(403)

    const other = await owner('catother')
    expect((await other.c.call('GET', `${s.base}/products/${id}`)).status).toBe(404)
    expect((await other.c.call('PUT', `${s.base}/products/${id}`, { name: 'Hijack', price: '1', status: 'active' })).status).toBe(404)
    expect((await other.c.call('GET', `/workspaces/${other.wid}/products`)).data.products.length).toBe(0)
  })

  test('categories, archive and image upload', async () => {
    const s = await shop('img')
    const cat = await s.c.call('POST', `${s.base}/categories`, { name: 'Drinkware' })
    expect(cat.status).toBe(200)
    expect((await s.c.call('POST', `${s.base}/categories`, { name: 'drinkware' })).status).toBe(409)
    const id = await s.product('Bottle', '20', { categoryId: cat.data.id })
    expect((await s.c.call('GET', `${s.base}/products/${id}`)).data.product.categoryName).toBe('Drinkware')

    expect((await s.c.raw('POST', `${s.base}/products/${id}/images`, new Uint8Array([1, 2, 3, 4]))).status).toBe(400)
    const up = await s.c.raw('POST', `${s.base}/products/${id}/images`, PNG)
    expect(up.status).toBe(200)
    const img = await client().call('GET', `/images/${up.data.id}`)
    expect(img.status).toBe(200)
    expect(Buffer.isBuffer(img.data)).toBe(true)

    expect((await s.c.call('DELETE', `${s.base}/products/${id}`)).status).toBe(200)
    expect((await s.c.call('GET', `${s.base}/products`)).data.products.length).toBe(0)
    expect((await s.c.call('GET', `${s.base}/products?status=archived`)).data.products.length).toBe(1)
  })
})

describe('storefront and checkout', () => {
  test('only published stores are public, and only active products show', async () => {
    const s = await shop('store')
    await s.product('Visible', '5')
    await s.c.call('POST', `${s.base}/products`, { name: 'Hidden draft', price: '5', status: 'draft' })
    const pub = client()
    expect((await pub.call('GET', `/public/stores/${s.slug}`)).status).toBe(404)
    await s.publish()
    const store = await pub.call('GET', `/public/stores/${s.slug}`)
    expect(store.status).toBe(200)
    expect(store.data.products.map((p: any) => p.name)).toEqual(['Visible'])
    expect((await s.c.call('PUT', `${s.base}/storefront`, { slug: 'app', title: 'x', published: true })).status).toBe(400)
    const dup = await shop('store2')
    expect((await dup.c.call('PUT', `${dup.base}/storefront`, { slug: s.slug, title: 'Dup', published: true })).status).toBe(409)
  })

  test('prices come from the server, discounts apply, stock is enforced', async () => {
    const s = await shop('price')
    const mug = await s.product('Mug', '12.50', { trackInventory: true, stock: 3 })
    const tee = await s.product('Tee', '30')
    await s.publish()
    const pub = client()

    const q = await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: mug, quantity: 2, price: '0.01' }, { productId: tee, quantity: 1 }] })
    expect(q.data.cart.subtotal).toBe('55')
    expect((await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: mug, quantity: 4 }] })).status).toBe(409)
    expect((await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: 'nope', quantity: 1 }] })).status).toBe(400)
    expect((await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: tee, quantity: 0 }] })).status).toBe(400)

    expect((await s.c.call('POST', `${s.base}/discounts`, { code: 'save10', kind: 'percent', value: 10, minSubtotal: '40' })).status).toBe(200)
    expect((await s.c.call('POST', `${s.base}/discounts`, { code: 'SAVE10', kind: 'percent', value: 10 })).status).toBe(409)
    const d = await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: mug, quantity: 2 }, { productId: tee, quantity: 1 }], discountCode: 'save10' })
    expect(d.data.cart.discount).toBe('5.5')
    expect(d.data.cart.total).toBe('49.5')
    expect((await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: tee, quantity: 1 }], discountCode: 'SAVE10' })).status).toBe(400)
    expect((await pub.call('POST', `/public/stores/${s.slug}/quote`, { items: [{ productId: tee, quantity: 2 }], discountCode: 'BOGUS' })).status).toBe(400)
  })

  test('checkout creates an unpaid order, reserves stock and records the customer', async () => {
    const s = await shop('order')
    const mug = await s.product('Mug', '12.50', { trackInventory: true, stock: 3 })
    await s.publish()
    expect((await s.c.call('POST', `${s.base}/discounts`, { code: 'FIVE', kind: 'fixed', value: '5', maxUses: 1 })).status).toBe(200)

    const placed = await client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: mug, quantity: 2 }], customer: customer(1), discountCode: 'FIVE' })
    expect(placed.status).toBe(200)
    expect(placed.data.total).toBe('20')

    expect((await s.c.call('GET', `${s.base}/products/${mug}`)).data.product.stock).toBe(1)
    const status = await client().call('GET', `/public/orders/${placed.data.publicId}`)
    expect(status.data.order.paymentStatus).toBe('unpaid')
    expect(status.data.order.status).toBe('pending')
    expect(status.data.order.discount).toBe('5')

    const orders = await s.c.call('GET', `${s.base}/orders`)
    expect(orders.data.orders.length).toBe(1)
    expect(orders.data.orders[0].number).toBe('1')
    const custs = await s.c.call('GET', `${s.base}/customers`)
    expect(custs.data.customers[0].email).toBe(customer(1).email)
    expect(custs.data.customers[0].orderCount).toBe(1)

    // The single-use code is exhausted; restricted countries are refused; unknown orders 404.
    expect((await client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: mug, quantity: 1 }], customer: customer(2), discountCode: 'FIVE' })).status).toBe(400)
    expect((await client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: mug, quantity: 1 }], customer: customer(3, { country: 'IR' }) })).status).toBe(400)
    expect((await client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: mug, quantity: 1 }], customer: customer(4, { email: 'bad' }) })).status).toBe(400)
    expect((await client().call('GET', '/public/orders/doesnotexistdoesnotexist')).status).toBe(404)
    // Same email again updates the same customer record.
    expect((await client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: mug, quantity: 1 }], customer: customer(1, { name: 'Buyer One Renamed' }) })).status).toBe(200)
    const again = await s.c.call('GET', `${s.base}/customers`)
    expect(again.data.customers.length).toBe(1)
    expect(again.data.customers[0].orderCount).toBe(2)
    expect(again.data.customers[0].name).toBe('Buyer One Renamed')
  })

  test('the last item can only be bought once under concurrent checkouts', async () => {
    const s = await shop('race')
    const rare = await s.product('Rare print', '99', { trackInventory: true, stock: 1 })
    await s.publish()
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => client().call('POST', `/public/stores/${s.slug}/orders`, { items: [{ productId: rare, quantity: 1 }], customer: customer(10 + n) })),
    )
    expect(results.filter((r) => r.status === 200).length).toBe(1)
    expect(results.filter((r) => r.status === 409).length).toBe(3)
    expect((await s.c.call('GET', `${s.base}/products/${rare}`)).data.product.stock).toBe(0)
    expect((await client().call('GET', `/public/stores/${s.slug}`)).data.products[0].availability).toBe('out')
  })
})

describe('orders, customers and invoices', () => {
  test('status workflow, stock restore on cancel, roles, and no manual payment', async () => {
    const s = await shop('flow')
    const mug = await s.product('Mug', '10', { trackInventory: true, stock: 5 })
    const placed = await s.c.call('POST', `${s.base}/orders`, { items: [{ productId: mug, quantity: 2 }], customer: customer(30) })
    expect(placed.status).toBe(200)
    const oid = placed.data.id as string
    expect((await s.c.call('GET', `${s.base}/products/${mug}`)).data.product.stock).toBe(3)

    // Payment status cannot be set through the API.
    expect((await s.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'paid' })).status).toBe(400)
    expect((await s.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'processing', paymentStatus: 'paid' })).status).toBe(200)
    const detail = await s.c.call('GET', `${s.base}/orders/${oid}`)
    expect(detail.data.order.paymentStatus).toBe('unpaid')
    expect(detail.data.events.map((e: any) => e.kind)).toEqual(['created', 'status'])

    const support = await addMember(s, 'flowsupport', 'support')
    expect((await support.c.call('GET', `${s.base}/orders/${oid}`)).status).toBe(200)
    expect((await support.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'fulfilled' })).status).toBe(403)
    expect((await support.c.call('POST', `${s.base}/customers`, { name: 'Support Added', email: 'sa@example.com' })).status).toBe(200)

    expect((await s.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'pending' })).status).toBe(409)
    expect((await s.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'cancelled' })).status).toBe(200)
    expect((await s.c.call('GET', `${s.base}/products/${mug}`)).data.product.stock).toBe(5)
    expect((await s.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'fulfilled' })).status).toBe(409)
    expect((await s.c.call('POST', `${s.base}/orders/${oid}/invoice`)).status).toBe(409)

    const stranger = await owner('flowstranger')
    expect((await stranger.c.call('GET', `${s.base}/orders/${oid}`)).status).toBe(404)
    expect((await stranger.c.call('PATCH', `${s.base}/orders/${oid}/status`, { status: 'fulfilled' })).status).toBe(404)
  })

  test('invoices are issued once, numbered per workspace, and shareable by opaque id', async () => {
    const s = await shop('inv')
    const tee = await s.product('Tee', '30')
    const o1 = (await s.c.call('POST', `${s.base}/orders`, { items: [{ productId: tee, quantity: 1 }], customer: customer(40) })).data.id as string
    const o2 = (await s.c.call('POST', `${s.base}/orders`, { items: [{ productId: tee, quantity: 3 }], customer: customer(41) })).data.id as string

    const i1 = await s.c.call('POST', `${s.base}/orders/${o1}/invoice`)
    const again = await s.c.call('POST', `${s.base}/orders/${o1}/invoice`)
    expect(i1.status).toBe(200)
    expect(again.data.id).toBe(i1.data.id)
    const i2 = await s.c.call('POST', `${s.base}/orders/${o2}/invoice`)

    const list = await s.c.call('GET', `${s.base}/invoices`)
    expect(list.data.invoices.map((i: any) => i.number).sort()).toEqual(['INV-000001', 'INV-000002'])
    const view = await s.c.call('GET', `${s.base}/invoices/${i2.data.id}`)
    expect(view.data.invoice.total).toBe('90')
    expect(view.data.invoice.paymentStatus).toBe('unpaid')
    expect(view.data.invoice.business.tradingName).toBe('inv shop')

    const pub = await client().call('GET', `/public/invoices/${view.data.invoice.publicId}`)
    expect(pub.status).toBe(200)
    expect(pub.data.invoice.number).toBe('INV-000002')
    expect((await client().call('GET', `/public/invoices/${i2.data.id}`)).status).toBe(404)

    // Another organization cannot read or list it, and cancelling voids it.
    const other = await owner('invother')
    expect((await other.c.call('GET', `${s.base}/invoices/${i2.data.id}`)).status).toBe(404)
    expect((await other.c.call('GET', `/workspaces/${other.wid}/invoices`)).data.invoices.length).toBe(0)
    expect((await s.c.call('PATCH', `${s.base}/orders/${o2}/status`, { status: 'cancelled' })).status).toBe(200)
    expect((await s.c.call('GET', `${s.base}/invoices/${i2.data.id}`)).data.invoice.status).toBe('void')
  })

  test('customer management and sales summary use real records', async () => {
    const s = await shop('cust')
    const tee = await s.product('Tee', '25')
    const created = await s.c.call('POST', `${s.base}/customers`, { name: 'Ada Lovelace', email: 'ada@example.com', country: 'GB', phone: '+44 20 7946 0958' })
    expect(created.status).toBe(200)
    expect((await s.c.call('POST', `${s.base}/customers`, { name: 'Ada Again', email: 'ADA@example.com' })).status).toBe(409)
    expect((await s.c.call('PUT', `${s.base}/customers/${created.data.id}`, { name: 'Ada L.', email: 'ada@example.com', notes: 'VIP', country: 'GB' })).status).toBe(200)
    const found = await s.c.call('GET', `${s.base}/customers?q=ada`)
    expect(found.data.customers[0].notes).toBe('VIP')

    await s.c.call('POST', `${s.base}/orders`, { items: [{ productId: tee, quantity: 2 }], customer: { name: 'Ada L.', email: 'ada@example.com', country: 'GB' } })
    const sum = await s.c.call('GET', `${s.base}/sales`)
    expect(sum.data.totals.orders).toBe(1)
    expect(sum.data.totals.orderValue).toBe('50')
    expect(sum.data.source).toBe('offchain-order-records')
    expect(sum.data.topProducts[0].name).toBe('Tee')
    const detail = await s.c.call('GET', `${s.base}/customers/${created.data.id}`)
    expect(detail.data.orders.length).toBe(1)
    const dash = await s.c.call('GET', `${s.base}/dashboard`)
    expect(dash.data.orders.total).toBe(1)
    expect(dash.data.orders.unpaid).toBe(1)

    expect((await s.c.call('DELETE', `${s.base}/customers/${created.data.id}`)).status).toBe(200)
    expect((await s.c.call('GET', `${s.base}/customers`)).data.customers.length).toBe(0)
    expect((await s.c.call('GET', `${s.base}/orders`)).data.orders.length).toBe(1)
  })
})
