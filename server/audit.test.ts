/* oxlint-disable no-explicit-any -- tests read loosely typed JSON responses */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { migrate } from './db'
import { clientIp } from './http'
import { handle, routes } from './index'
import { addMember, client, customer, owner, PASSWORD, register, run } from './test-util'

beforeAll(async () => {
  // other test files point the AI provider at a local stand-in; these tests check the unconfigured behaviour
  for (const k of ['AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL']) delete process.env[k]
  await migrate()
})

const ENV_BEFORE = process.env.TRUST_PROXY
afterAll(() => {
  process.env.TRUST_PROXY = ENV_BEFORE
})

describe('authentication', () => {
  test('repeated wrong passwords are rate limited per account and address', async () => {
    const u = await register('brute')
    const attacker = client()
    let last = 0
    for (let i = 0; i < 12; i++) last = (await attacker.call('POST', '/auth/signin', { email: u.email, password: `wrong-password-${i}` })).status
    expect(last).toBe(429)
    // even the right password is refused while the limit holds, so guessing cannot continue
    expect((await attacker.call('POST', '/auth/signin', { email: u.email, password: PASSWORD })).status).toBe(429)
  })

  test('a forged X-Forwarded-For header cannot dodge rate limits unless a trusted proxy is configured', async () => {
    process.env.TRUST_PROXY = 'false'
    try {
      const email = `forge-${run}@example.com`
      let last = 0
      for (let i = 0; i < 12; i++) {
        const res = await handle(
          new Request('http://test/auth/signin', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', 'x-forwarded-for': `198.51.100.${i}` },
            body: JSON.stringify({ email, password: `nope-nope-${i}` }),
          }),
          '203.0.113.7',
        )
        last = res.status
      }
      expect(last).toBe(429)
      expect(clientIp(new Request('http://t', { headers: { 'x-forwarded-for': '1.1.1.1' } }), '9.9.9.9')).toBe('9.9.9.9')
      process.env.TRUST_PROXY = 'true'
      expect(clientIp(new Request('http://t', { headers: { 'x-forwarded-for': '6.6.6.6, 1.1.1.1' } }), '9.9.9.9')).toBe('1.1.1.1')
    } finally {
      process.env.TRUST_PROXY = 'true'
    }
  })

  test('sign out and password change end sessions on the server, not just in the browser', async () => {
    const u = await register('sess')
    const second = client()
    expect((await second.call('POST', '/auth/signin', { email: u.email, password: PASSWORD })).status).toBe(200)
    const stolen = u.c.cookie
    expect((await u.c.call('POST', '/auth/signout')).status).toBe(200)
    const replay = client()
    replay.cookie = stolen
    expect((await replay.call('GET', '/auth/me')).data.user).toBeNull()

    const third = client()
    await third.call('POST', '/auth/signin', { email: u.email, password: PASSWORD })
    const old = third.cookie
    expect((await second.call('POST', '/account/password', { currentPassword: PASSWORD, newPassword: 'a-brand-new-passphrase' })).status).toBe(200)
    const replay2 = client()
    replay2.cookie = old
    expect((await replay2.call('GET', '/auth/me')).data.user).toBeNull()
    expect((await second.call('GET', '/auth/me')).data.user.email).toBe(u.email)
  })

  test('session cookies are HttpOnly and SameSite, and Secure behind HTTPS', async () => {
    const mk = (proto?: string) =>
      handle(
        new Request('http://test/auth/signup', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', 'x-forwarded-for': `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(proto ? { 'x-forwarded-proto': proto } : {}) },
          body: JSON.stringify({ name: 'Cookie Test', email: `cookie-${Math.random().toString(36).slice(2)}@example.com`, password: PASSWORD }),
        }),
      )
    const plain = (await mk()).headers.getSetCookie().find((c) => c.startsWith('sp_session='))!
    expect(plain).toContain('HttpOnly')
    expect(plain).toContain('SameSite=Lax')
    const https = (await mk('https')).headers.getSetCookie().find((c) => c.startsWith('sp_session='))!
    expect(https).toContain('Secure')
  })

  test('the development mailbox never shows another browser the reset link for an address', async () => {
    const victim = await register('victim')
    const victimBrowser = client()
    expect((await victimBrowser.call('POST', '/auth/forgot-password', { email: victim.email })).status).toBe(200)
    const attacker = client()
    // the attacker only knows the email address
    const stolen = await attacker.call('GET', `/dev/outbox?email=${encodeURIComponent(victim.email)}`)
    expect(stolen.status).toBe(200)
    expect(stolen.data.messages.length).toBe(0)
    expect((await attacker.call('POST', '/auth/reset-password', { token: 'guess', password: 'attacker-chosen-password' })).status).toBe(400)
    // the person who asked for the reset, and the signed-in owner of the address, can still read their own mail
    expect((await victimBrowser.call('GET', `/dev/outbox?email=${encodeURIComponent(victim.email)}`)).data.messages.some((m: any) => m.subject.includes('Reset'))).toBe(true)
    expect((await victim.c.call('GET', `/dev/outbox?email=${encodeURIComponent(victim.email)}`)).data.messages.length).toBeGreaterThan(0)
  })

  test('password reset requests do not reveal whether an account exists', async () => {
    const real = await register('enum')
    const a = await client().call('POST', '/auth/forgot-password', { email: real.email })
    const b = await client().call('POST', '/auth/forgot-password', { email: `nobody-${run}@example.com` })
    expect(a.status).toBe(b.status)
    expect(a.data).toEqual(b.data)
  })
})

describe('request hardening', () => {
  test('bad input is rejected cleanly, never with a server error', async () => {
    const c = client()
    const post = (path: string, raw: string, extra: Record<string, string> = {}) =>
      handle(new Request(`http://test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', 'x-forwarded-for': '10.88.1.1', ...extra }, body: raw }))
    expect((await post('/auth/signin', '{not json')).status).toBe(400)
    expect((await post('/auth/signin', '[]')).status).toBe(400)
    expect((await post('/auth/signin', 'null')).status).toBe(400)
    expect((await post('/auth/signin', '"text"')).status).toBe(400)
    expect((await post('/auth/signin', JSON.stringify({ email: 'x'.repeat(5000), password: 'y' }))).status).toBeLessThan(500)
    expect((await post('/auth/signin', 'x'.repeat(200_000), { 'content-length': '200000' })).status).toBe(413)
    expect((await c.call('GET', '/nope')).status).toBe(404)
    expect((await c.call('PATCH', '/auth/signin', {})).status).toBe(404)
    const res = await handle(new Request('http://test/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    expect(res.status).toBe(403) // missing CSRF header
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('error responses never leak stack traces or SQL', async () => {
    const u = await owner('leak')
    const bad = await u.c.call('GET', `/workspaces/${u.wid}/orders/not-a-uuid`)
    expect(bad.status).toBe(404)
    expect(JSON.stringify(bad.data)).not.toMatch(/select|insert|at .*\.ts|node_modules|postgres/i)
  })
})

/** Rebuilds a concrete URL from a route's compiled pattern. */
function pathFor(re: RegExp, ids: Record<string, string>, prefixIds: Record<string, string>): string {
  let src = re.source.slice(1, -1).replace(/\\\//g, '/')
  src = src.replace(/([a-z-]+)\/\(\?<(\w+)>\[\^\/\]\+\)/g, (_m, seg: string, name: string) => `${seg}/${prefixIds[`${seg}/${name}`] ?? ids[name] ?? '00000000-0000-4000-8000-000000000000'}`)
  return src.replace(/\(\?<(\w+)>\[\^\/\]\+\)/g, (_m, name: string) => ids[name] ?? '00000000-0000-4000-8000-000000000000')
}

describe('organization isolation and access control, checked on every workspace route', () => {
  test('no outsider and no anonymous visitor can touch any workspace route, with real record ids', async () => {
    const a = await owner('isoa')
    const b = await owner('isob')
    const base = `/workspaces/${a.wid}`
    const mk = async (path: string, body: unknown) => (await a.c.call('POST', `${base}${path}`, body)).data.id as string

    const product = await mk('/products', { name: 'Iso Mug', description: 'x', price: '5', status: 'active' })
    const category = await mk('/categories', { name: 'Iso cat' })
    const discount = await mk('/discounts', { code: 'ISO10', kind: 'percent', value: '10' })
    const doc = await mk('/knowledge', { title: 'Iso doc', body: 'Private text for isolation test.', kind: 'faq', visibility: 'internal' })
    const workflow = await mk('/workflows', { template: 'new-order-notify' })
    const slug = `iso-${run}`
    await a.c.call('PUT', `${base}/storefront`, { slug, title: 'Iso', tagline: '', description: '', published: true })
    const order = (await client().call('POST', `/public/stores/${slug}/orders`, { items: [{ productId: product, quantity: 1 }], customer: customer(901) })).data
    const orderId = (await a.c.call('GET', `${base}/orders`)).data.orders[0].id as string
    const invoice = (await a.c.call('POST', `${base}/orders/${orderId}/invoice`, {})).data.id as string
    const cust = (await a.c.call('GET', `${base}/customers`)).data.customers[0].id as string
    await client().call('POST', `/public/stores/${slug}/support`, { name: 'Iso Buyer', email: `isob-${run}@example.com`, subject: 'Hello there', message: 'A question for the isolation test.' })
    const convo = (await a.c.call('GET', `${base}/support`)).data.conversations[0].id as string
    expect(order.publicId).toBeTruthy()

    const prefixIds: Record<string, string> = {
      'categories/cid': category, 'customers/cid': cust, 'support/cid': convo, 'products/pid': product, 'orders/oid': orderId,
      'invoices/vid': invoice, 'discounts/did': discount, 'knowledge/kid': doc, 'workflows/fid': workflow, 'members/uid': (await a.c.call('GET', '/auth/me')).data.user.id,
    }
    const wsRoutes = routes.filter((r) => r.re.source.includes('(?<wid>'))
    expect(wsRoutes.length).toBeGreaterThan(60)

    const anon = client()
    const failures: string[] = []
    for (const r of wsRoutes) {
      const url = pathFor(r.re, { wid: a.wid }, prefixIds)
      const body = r.method === 'GET' ? undefined : {}
      const asB = await b.c.call(r.method, url, body)
      if (asB.status !== 404) failures.push(`outsider ${r.method} ${url} -> ${asB.status}`)
      const asAnon = await anon.call(r.method, url, body)
      if (asAnon.status !== 401) failures.push(`anonymous ${r.method} ${url} -> ${asAnon.status}`)
    }
    expect(failures).toEqual([])

    // and the owner is never served a server error by any route, even with junk ids and empty bodies
    const crashes: string[] = []
    for (const r of wsRoutes) {
      const junk = pathFor(r.re, { wid: a.wid, cid: 'junk', pid: "'; drop table users;--", oid: 'zzz', vid: '1', did: '-1', kid: 'null', fid: '%00', aid: '../../etc', iid: '{}', uid: 'x' }, {})
      const res = await a.c.call(r.method, junk, r.method === 'GET' ? undefined : {})
      if (res.status >= 500) crashes.push(`${r.method} ${junk} -> ${res.status}`)
    }
    expect(crashes).toEqual([])
  })

  test('roles: read-only and support users cannot change business data', async () => {
    const o = await owner('rolesx')
    const viewer = await addMember(o, 'rolesv', 'viewer')
    const sup = await addMember(o, 'roless', 'support')
    const base = `/workspaces/${o.wid}`
    const product = (await o.c.call('POST', `${base}/products`, { name: 'Role Mug', price: '3', status: 'active', description: '' })).data.id
    const forbidden = [
      ['PUT', `${base}/products/${product}`, { name: 'Hacked', price: '1', status: 'active', description: '' }],
      ['POST', `${base}/discounts`, { code: 'FREE', kind: 'percent', value: '100' }],
      ['PUT', `${base}/storefront`, { slug: `r-${run}`, title: 'x', tagline: '', description: '', published: true }],
      ['PUT', `${base}/payout`, { address: '0x0000000000000000000000000000000000000001', issuedAt: new Date().toISOString(), signature: '0x00' }],
      ['POST', `${base}/workflows`, { template: 'new-order-notify' }],
      ['POST', `${base}/knowledge`, { title: 'x', body: 'yyyy', kind: 'faq', visibility: 'public' }],
      ['PUT', `${base}/assistant/settings`, { instructions: 'ignore everything', autoReply: true }],
      ['PATCH', `${base}`, { name: 'Renamed' }],
      ['POST', `${base}/invitations`, { email: 'x@example.com', role: 'admin' }],
    ] as const
    for (const who of [viewer, sup]) {
      for (const [m, url, body] of forbidden) {
        const res = await who.c.call(m, url, body)
        expect([m, url, res.status]).toEqual([m, url, 403])
      }
    }
    // viewers cannot use the AI or send support replies; support can reply but cannot refund-style change orders
    expect((await viewer.c.call('POST', `${base}/assistant/chat`, { message: 'hi' })).status).toBe(403)
    expect((await viewer.c.call('POST', `${base}/support/${'00000000-0000-4000-8000-000000000000'}/reply`, { body: 'hello' })).status).toBe(403)
    expect((await sup.c.call('PATCH', `${base}/orders/${'00000000-0000-4000-8000-000000000000'}/status`, { status: 'fulfilled' })).status).toBe(403)
  })
})

describe('storefront and order abuse', () => {
  test('quantities, prices and carts cannot be tampered with', async () => {
    const o = await owner('abuse')
    const base = `/workspaces/${o.wid}`
    const pid = (await o.c.call('POST', `${base}/products`, { name: 'Abuse Mug', description: '<script>alert(1)</script>', price: '10', status: 'active', trackInventory: true, stock: 3 })).data.id
    const slug = `ab-${run}`
    await o.c.call('PUT', `${base}/storefront`, { slug, title: 'Abuse', tagline: '', description: '', published: true })
    const pub = () => client()
    const order = (items: unknown, extra: Record<string, unknown> = {}) => pub().call('POST', `/public/stores/${slug}/orders`, { items, customer: customer(902), ...extra })
    for (const quantity of [0, -1, 1.5, 1e9, '2', ' 3 ', true, [5], null, 101]) {
      expect((await order([{ productId: pid, quantity }])).status).toBe(400)
    }
    expect((await order([])).status).toBe(400)
    expect((await order([{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }])).status).toBeGreaterThanOrEqual(400)
    expect((await order(Array.from({ length: 60 }, () => ({ productId: pid, quantity: 1 })))).status).toBeLessThan(500)
    const tampered = await order([{ productId: pid, quantity: 1, price: '0.01', unitPrice: '0.01' }], { total: '0.01', paymentStatus: 'paid', status: 'fulfilled' })
    expect(tampered.status).toBe(200)
    expect(tampered.data.total).toBe('10')
    const view = (await pub().call('GET', `/public/orders/${tampered.data.publicId}`)).data
    expect(JSON.stringify(view)).not.toContain('@example.com') // the public status page does not echo the buyer's email
    const mine = (await o.c.call('GET', `${base}/orders`)).data.orders.find((x: any) => x.number === String(tampered.data.number))
    expect(mine.paymentStatus).toBe('unpaid')
    expect(mine.status).toBe('pending')
    // stored HTML is only ever returned as JSON text with nosniff, so it is never executed by the API
    const res = await handle(new Request(`http://test/public/stores/${slug}/products/${pid}`))
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('public ids are unguessable and private records are not listed publicly', async () => {
    const o = await owner('pubid')
    const base = `/workspaces/${o.wid}`
    await o.c.call('POST', `${base}/products`, { name: 'Draft thing', price: '4', status: 'draft', description: '' })
    const slug = `pu-${run}`
    await o.c.call('PUT', `${base}/storefront`, { slug, title: 'Pub', tagline: '', description: '', published: false })
    expect((await client().call('GET', `/public/stores/${slug}`)).status).toBe(404)
    for (const id of ['1', 'abc', '0'.repeat(22), "' OR 1=1 --"]) {
      expect((await client().call('GET', `/public/orders/${id}`)).status).toBe(404)
      expect((await client().call('GET', `/public/invoices/${id}`)).status).toBe(404)
      expect((await client().call('GET', `/public/support/${id}`)).status).toBe(404)
    }
  })
})

describe('AI permissions', () => {
  test('AI conversations are private to their author and blocked for other organizations', async () => {
    const o = await owner('aiperm')
    const mate = await addMember(o, 'aimate', 'manager')
    const base = `/workspaces/${o.wid}`
    // With no provider configured the endpoints refuse honestly rather than inventing answers.
    const noai = await o.c.call('POST', `${base}/assistant/chat`, { message: 'hello' })
    expect([503, 200]).toContain(noai.status)
    expect((await mate.c.call('GET', `${base}/assistant/conversations/${'00000000-0000-4000-8000-000000000000'}`)).status).toBe(404)
    const other = await owner('aiother')
    expect((await other.c.call('GET', `${base}/assistant/conversations`)).status).toBe(404)
    expect((await other.c.call('POST', `${base}/assistant/report`, { days: 7 })).status).toBe(404)
  })

  test('no workflow step type can touch funds, and payments cannot be marked paid through the API', async () => {
    const o = await owner('nofunds')
    const base = `/workspaces/${o.wid}`
    for (const type of ['transfer', 'transfer_usdc', 'send_payment', 'refund', 'approve', 'mark_paid', 'pay', 'sign']) {
      const wf = (await o.c.call('POST', `${base}/workflows`, { name: 'Bad flow', trigger: 'order.created' })).data.id
      const res = await o.c.call('PUT', `${base}/workflows/${wf}`, {
        name: 'Bad flow', trigger: 'order.created',
        graph: { nodes: [{ id: 't', type: 'trigger', x: 0, y: 0, config: {} }, { id: 'x', type: type, x: 200, y: 0, config: {} }], edges: [{ from: 't', to: 'x' }] },
      })
      expect([type, res.status]).toEqual([type, 400])
    }
    const pid = (await o.c.call('POST', `${base}/products`, { name: 'Pay Mug', price: '2', status: 'active', description: '' })).data.id
    const slug = `nf-${run}`
    await o.c.call('PUT', `${base}/storefront`, { slug, title: 'NF', tagline: '', description: '', published: true })
    await client().call('POST', `/public/stores/${slug}/orders`, { items: [{ productId: pid, quantity: 1 }], customer: customer(903) })
    const orderId = (await o.c.call('GET', `${base}/orders`)).data.orders[0].id
    for (const status of ['paid', 'refunded', 'PAID']) {
      expect((await o.c.call('PATCH', `${base}/orders/${orderId}/status`, { status })).status).toBe(400)
    }
    expect((await o.c.call('PATCH', `${base}/orders/${orderId}`, { paymentStatus: 'paid' })).status).toBe(404)
  })
})

describe('payments cannot be forged', () => {
  test('a made-up transaction hash never marks an order paid', async () => {
    const o = await owner('forge')
    const base = `/workspaces/${o.wid}`
    const pid = (await o.c.call('POST', `${base}/products`, { name: 'Forge Mug', price: '2', status: 'active', description: '' })).data.id
    const slug = `fg-${run}`
    await o.c.call('PUT', `${base}/storefront`, { slug, title: 'FG', tagline: '', description: '', published: true })
    const placed = (await client().call('POST', `/public/stores/${slug}/orders`, { items: [{ productId: pid, quantity: 1 }], customer: customer(904) })).data
    // no payout wallet yet: a payment request is refused rather than invented
    const refused = await client().call('POST', `/public/orders/${placed.publicId}/payment`, {})
    expect(refused.status).toBe(409)
    for (const bad of ['0x', 'nothash', '0x' + 'z'.repeat(64), '0x' + 'a'.repeat(63)]) {
      expect((await client().call('POST', `/public/orders/${placed.publicId}/payment/submit`, { txHash: bad })).status).toBeGreaterThanOrEqual(400)
    }
    const status = (await client().call('GET', `/public/orders/${placed.publicId}`)).data
    expect(JSON.stringify(status)).toContain('unpaid')
  })
})
