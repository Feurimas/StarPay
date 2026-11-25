/* oxlint-disable no-explicit-any -- test helpers read loosely typed JSON responses */
import { expect } from 'bun:test'
// Tests are separate clients behind a trusted "proxy": each gets its own forwarded address so rate limits do not collide.
process.env.TRUST_PROXY = 'true'
const { handle } = await import('./index')

export const run = Math.random().toString(36).slice(2, 8)
export const PASSWORD = 'correct-horse-9'

export interface Res {
  status: number
  data: any
}

export interface Client {
  cookie: string
  call: (method: string, path: string, body?: unknown) => Promise<Res>
  raw: (method: string, path: string, body: Uint8Array) => Promise<Res>
}

const jars = new WeakMap<Client, Map<string, string>>()
function absorb(c: Client, res: Response) {
  const jar = jars.get(c) ?? new Map<string, string>()
  jars.set(c, jar)
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';')
    const eq = pair!.indexOf('=')
    const name = pair!.slice(0, eq)
    const value = pair!.slice(eq + 1)
    if (value === '' || /max-age=0/i.test(line)) jar.delete(name)
    else jar.set(name, value)
  }
  c.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
}

let ipCounter = 0
export function client(): Client {
  const ip = `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`
  const c: Client = {
    cookie: '',
    async call(method, path, body) {
      const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip }
      if (method !== 'GET') headers['x-requested-with'] = 'fetch'
      if (c.cookie) headers.cookie = c.cookie
      const res = await handle(new Request(`http://test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
      absorb(c, res)
      const type = res.headers.get('content-type') ?? ''
      return { status: res.status, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
    },
    async raw(method, path, body) {
      const headers: Record<string, string> = { 'content-type': 'application/octet-stream', 'x-forwarded-for': ip, 'x-requested-with': 'fetch' }
      if (c.cookie) headers.cookie = c.cookie
      const res = await handle(new Request(`http://test${path}`, { method, headers, body }))
      return { status: res.status, data: await res.json() }
    },
  }
  return c
}

export async function register(label: string) {
  const c = client()
  const email = `${label}-${run}@example.com`
  const res = await c.call('POST', '/auth/signup', { name: `User ${label}`, email, password: PASSWORD })
  expect(res.status).toBe(200)
  return { c, email }
}

export async function verify(c: Client, email: string) {
  const box = await c.call('GET', `/dev/outbox?email=${encodeURIComponent(email)}`)
  const token = box.data.messages.find((m: any) => m.subject.includes('Verify')).actionPath.split('#')[1]
  expect((await c.call('POST', '/auth/verify-email', { token })).status).toBe(200)
}

/** Registers a verified owner with a workspace. */
export async function owner(label: string, country = 'US') {
  const u = await register(label)
  await verify(u.c, u.email)
  const ws = await u.c.call('POST', '/workspaces', { name: `${label} shop`, country })
  expect(ws.status).toBe(200)
  return { ...u, wid: ws.data.id as string }
}

/** Adds a verified member with the given role to a workspace. */
export async function addMember(o: { c: Client; wid: string }, label: string, role: string) {
  const u = await register(label)
  await verify(u.c, u.email)
  expect((await o.c.call('POST', `/workspaces/${o.wid}/invitations`, { email: u.email, role })).status).toBe(200)
  const box = await u.c.call('GET', `/dev/outbox?email=${encodeURIComponent(u.email)}`)
  const token = box.data.messages.find((m: any) => m.subject.includes('invited')).actionPath.split('#')[1]
  expect((await u.c.call('POST', '/invitations/accept', { token })).status).toBe(200)
  return u
}

export const customer = (n: number, extra: Record<string, unknown> = {}) => ({
  name: `Buyer ${n}`, email: `buyer${n}-${run}@example.com`, country: 'GB', addressLine1: '1 High St', city: 'London', postalCode: 'N1 1AA', ...extra,
})

// 1x1 PNG
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
