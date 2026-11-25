import type { Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, email, notFound, oneOf, rateLimit, readCookie, sha256, str } from './http'
import { EMAIL_MODE } from './mail'

export async function contact(ctx: Ctx) {
  rateLimit(`contact:${ctx.ip}`, 5, 60 * 60_000)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 100 })
  const mail = email(body)
  const topic = oneOf(body, 'topic', ['sales', 'support', 'partnership', 'other'] as const)
  const message = str(body, 'message', { min: 10, max: 4000 })
  await sql`INSERT INTO contact_messages (name, email, topic, message, ip) VALUES (${name}, ${mail}, ${topic}, ${message}, ${ctx.ip})`
  return { ok: true }
}

export async function restrictedCountries() {
  const list = await rows<{ code: string }>(sql`SELECT code FROM restricted_countries ORDER BY code`)
  return { restricted: list.map((r) => r.code) }
}

/** Development-only mailbox. Disabled as soon as EMAIL_MODE is anything other than "dev". */
export async function devOutbox(ctx: Ctx) {
  if (EMAIL_MODE !== 'dev') throw notFound()
  rateLimit(`outbox:${ctx.ip}`, 60, 15 * 60_000)
  const to = (ctx.url.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!to || to.length > 254) throw badRequest('email is required.')
  // A message is visible only to the browser whose action created it, or to the signed-in owner of the address.
  // Without this, anyone who knew an email address could read its password reset link.
  const key = readCookie(ctx.req, 'sp_dev')
  const keyHash = key ? sha256(key) : ''
  const own = ctx.user?.email.toLowerCase() === to
  const messages = await rows<{ id: string; subject: string; body: string; action_path: string | null; created_at: Date }>(sql`
    SELECT id, subject, body, action_path, created_at FROM dev_outbox
    WHERE lower(to_email) = ${to} AND (${own} OR (client_key IS NOT NULL AND client_key = ${keyHash}))
    ORDER BY created_at DESC LIMIT 10`)
  return {
    mode: 'dev',
    messages: messages.map((m) => ({ id: m.id, subject: m.subject, body: m.body, actionPath: m.action_path, createdAt: m.created_at })),
  }
}

export function health() {
  return { ok: true, emailMode: EMAIL_MODE }
}
