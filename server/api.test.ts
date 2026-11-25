import { beforeAll, describe, expect, test } from 'bun:test'
import { handle } from './index'
import { migrate } from './db'
import { client, PASSWORD, register, run, verify } from './test-util'

beforeAll(async () => {
  await migrate()
})

describe('accounts', () => {
  test('rejects weak passwords and bad emails', async () => {
    const c = client()
    expect((await c.call('POST', '/auth/signup', { name: 'A B', email: 'nope', password: PASSWORD })).status).toBe(400)
    expect((await c.call('POST', '/auth/signup', { name: 'A B', email: `weak-${run}@example.com`, password: 'short1' })).status).toBe(400)
    expect((await c.call('POST', '/auth/signup', { name: 'A B', email: `weak-${run}@example.com`, password: 'password123' })).status).toBe(400)
    expect((await c.call('POST', '/auth/signup', { name: 'A B', email: `weak-${run}@example.com`, password: 'aaaaaaaaaaaa' })).status).toBe(400)
    expect((await c.call('POST', '/auth/signup', { name: 'A B', email: `weak-${run}@example.com`, password: `weak-${run}@example.com` })).status).toBe(400)
  })

  test('accepts passphrases and non-Latin passwords (no forced letter and number mix)', async () => {
    for (const [i, pw] of ['correct horse battery staple', 'আমারসোনারবাংলা', 'Tr0ub4dor&3xyz', '!!??!!??ab-cd'].entries()) {
      const c = client()
      const r = await c.call('POST', '/auth/signup', { name: 'Pass Phrase', email: `pp${i}-${run}@example.com`, password: pw })
      expect(r.status).toBe(200)
      expect((await client().call('POST', '/auth/signin', { email: `pp${i}-${run}@example.com`, password: pw })).status).toBe(200)
    }
  })

  test('requires the CSRF header on writes', async () => {
    const res = await handle(
      new Request('http://test/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    )
    expect(res.status).toBe(403)
  })

  test('sign up, session, verify email, sign out, wrong password', async () => {
    const { c, email } = await register('alice')
    const me1 = await c.call('GET', '/auth/me')
    expect(me1.data.user?.email).toBe(email)
    expect(me1.data.user?.emailVerified).toBe(false)
    await verify(c, email)
    expect((await c.call('GET', '/auth/me')).data.user?.emailVerified).toBe(true)
    await c.call('POST', '/auth/signout')
    expect((await c.call('GET', '/auth/me')).data.user).toBeNull()
    const bad = await c.call('POST', '/auth/signin', { email, password: 'wrong-password-1' })
    expect(bad.status).toBe(401)
    const good = await c.call('POST', '/auth/signin', { email, password: PASSWORD })
    expect(good.status).toBe(200)
  })

  test('verification tokens are single use', async () => {
    const { c, email } = await register('single')
    const box = await c.call('GET', `/dev/outbox?email=${encodeURIComponent(email)}`)
    const token = box.data.messages[0]!.actionPath!.split('#')[1]
    expect((await c.call('POST', '/auth/verify-email', { token })).status).toBe(200)
    expect((await c.call('POST', '/auth/verify-email', { token })).status).toBe(400)
  })

  test('password reset works once and ends old sessions', async () => {
    const { c, email } = await register('reset')
    await c.call('POST', '/auth/forgot-password', { email })
    expect((await c.call('POST', '/auth/forgot-password', { email: `ghost-${run}@example.com` })).status).toBe(200)
    const box = await c.call('GET', `/dev/outbox?email=${encodeURIComponent(email)}`)
    const token = box.data.messages.find((m: { subject: string }) => m.subject.includes('Reset'))!.actionPath!.split('#')[1]
    expect((await c.call('POST', '/auth/reset-password', { token, password: 'brand-new-pass-1' })).status).toBe(200)
    expect((await c.call('POST', '/auth/reset-password', { token, password: 'another-pass-22' })).status).toBe(400)
    expect((await c.call('GET', '/auth/me')).data.user).toBeNull()
    const again = client()
    expect((await again.call('POST', '/auth/signin', { email, password: 'brand-new-pass-1' })).status).toBe(200)
  })
})

describe('workspaces and isolation', () => {
  test('blocks restricted jurisdictions', async () => {
    const { c } = await register('geo')
    const res = await c.call('POST', '/workspaces', { name: 'Blocked Co', country: 'KP' })
    expect(res.status).toBe(403)
  })

  test('one organization can never read another', async () => {
    const a = await register('orga')
    const b = await register('orgb')
    const wa = await a.c.call('POST', '/workspaces', { name: 'Org A', country: 'US' })
    const wb = await b.c.call('POST', '/workspaces', { name: 'Org B', country: 'GB' })
    expect(wa.status).toBe(200)
    const idA = wa.data.id as string
    const idB = wb.data.id as string
    for (const path of [`/workspaces/${idA}`, `/workspaces/${idA}/members`, `/workspaces/${idA}/dashboard`, `/workspaces/${idA}/audit`]) {
      expect((await b.c.call('GET', path)).status).toBe(404)
    }
    expect((await b.c.call('PATCH', `/workspaces/${idA}`, { name: 'Hijack' })).status).toBe(404)
    expect((await a.c.call('GET', `/workspaces/${idB}`)).status).toBe(404)
    expect((await client().call('GET', `/workspaces/${idA}`)).status).toBe(401)
  })

  test('invitation, role permissions and ownership safety', async () => {
    const owner = await register('own')
    await verify(owner.c, owner.email)
    const ws = (await owner.c.call('POST', '/workspaces', { name: 'Team Co', country: 'DE' })).data.id as string
    const guest = await register('guest')

    const invite = await owner.c.call('POST', `/workspaces/${ws}/invitations`, { email: guest.email, role: 'viewer' })
    expect(invite.status).toBe(200)
    const box = await guest.c.call('GET', `/dev/outbox?email=${encodeURIComponent(guest.email)}`)
    const token = box.data.messages.find((m: { subject: string }) => m.subject.includes('invited'))!.actionPath!.split('#')[1]

    // Unverified invitee cannot accept.
    expect((await guest.c.call('POST', '/invitations/accept', { token })).status).toBe(403)
    await verify(guest.c, guest.email)
    // A different user cannot accept someone else's invitation.
    const other = await register('other')
    await verify(other.c, other.email)
    expect((await other.c.call('POST', '/invitations/accept', { token })).status).toBe(403)

    expect((await guest.c.call('POST', '/invitations/accept', { token })).status).toBe(200)
    expect((await guest.c.call('POST', '/invitations/accept', { token })).status).toBe(404)

    // Viewer can see the workspace but cannot change it, invite, or read the audit log.
    expect((await guest.c.call('GET', `/workspaces/${ws}`)).data.role).toBe('viewer')
    expect((await guest.c.call('PATCH', `/workspaces/${ws}`, { name: 'Nope' })).status).toBe(403)
    expect((await guest.c.call('POST', `/workspaces/${ws}/invitations`, { email: other.email, role: 'viewer' })).status).toBe(403)
    expect((await guest.c.call('GET', `/workspaces/${ws}/audit`)).status).toBe(403)

    // Owner cannot remove the last owner; viewer cannot promote themselves.
    const ownerId = (await owner.c.call('GET', '/auth/me')).data.user?.id as string
    const guestId = (await guest.c.call('GET', '/auth/me')).data.user?.id as string
    expect((await owner.c.call('DELETE', `/workspaces/${ws}/members/${ownerId}`)).status).toBe(409)
    expect((await guest.c.call('PATCH', `/workspaces/${ws}/members/${guestId}`, { role: 'owner' })).status).toBe(403)

    // Admin may not grant owner or admin.
    expect((await owner.c.call('PATCH', `/workspaces/${ws}/members/${guestId}`, { role: 'admin' })).status).toBe(200)
    expect((await guest.c.call('POST', `/workspaces/${ws}/invitations`, { email: other.email, role: 'admin' })).status).toBe(403)
    expect((await guest.c.call('POST', `/workspaces/${ws}/invitations`, { email: other.email, role: 'support' })).status).toBe(200)

    // Removed members lose access.
    expect((await owner.c.call('DELETE', `/workspaces/${ws}/members/${guestId}`)).status).toBe(200)
    expect((await guest.c.call('GET', `/workspaces/${ws}`)).status).toBe(404)
  })

  test('account deletion anonymizes the user and is blocked while others depend on you', async () => {
    const o = await register('del')
    const ws = (await o.c.call('POST', '/workspaces', { name: 'Gone Co', country: 'US' })).data.id as string
    const m = await register('member')
    await verify(m.c, m.email)
    await o.c.call('POST', `/workspaces/${ws}/invitations`, { email: m.email, role: 'viewer' })
    const box = await m.c.call('GET', `/dev/outbox?email=${encodeURIComponent(m.email)}`)
    const token = box.data.messages.find((x: { subject: string }) => x.subject.includes('invited'))!.actionPath!.split('#')[1]
    await m.c.call('POST', '/invitations/accept', { token })
    expect((await o.c.call('POST', '/account/delete', { password: PASSWORD })).status).toBe(409)
    expect((await m.c.call('POST', '/account/delete', { password: 'wrong-password-1' })).status).toBe(401)
    expect((await m.c.call('POST', '/account/delete', { password: PASSWORD })).status).toBe(200)
    expect((await m.c.call('GET', '/auth/me')).data.user).toBeNull()
  })
})
