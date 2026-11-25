import { rows, sql } from './db'
import { audit, requireUser, toAuthUser, type Ctx } from './context'
import {
  asBody,
  badRequest,
  conflict,
  country,
  email,
  HttpError,
  newToken,
  password,
  rateLimit,
  readCookie,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookie,
  sha256,
  str,
  unauthorized,
} from './http'
import { sendMail } from './mail'

const DAY = 86_400_000

async function createSession(ctx: Ctx, userId: string): Promise<Response> {
  const token = newToken()
  await sql`
    INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (${userId}, ${sha256(token)}, ${ctx.req.headers.get('user-agent')?.slice(0, 300) ?? null},
            ${ctx.ip}, ${new Date(Date.now() + SESSION_DAYS * DAY)})`
  const user = await rows<Parameters<typeof toAuthUser>[0]>(sql`
    SELECT id, email, name, email_verified_at, phone, country, locale, timezone FROM users WHERE id = ${userId}`)
  return Response.json(
    { user: toAuthUser(user[0]!) },
    { headers: { 'Set-Cookie': sessionCookie(ctx.req, token, SESSION_DAYS * 86_400) } },
  )
}

async function issueEmailToken(userId: string, kind: 'verify' | 'reset', ttlMs: number): Promise<string> {
  await sql`UPDATE email_tokens SET used_at = now() WHERE user_id = ${userId} AND kind = ${kind} AND used_at IS NULL`
  const token = newToken()
  await sql`
    INSERT INTO email_tokens (user_id, kind, token_hash, expires_at)
    VALUES (${userId}, ${kind}, ${sha256(token)}, ${new Date(Date.now() + ttlMs)})`
  return token
}

async function sendVerification(userId: string, to: string, name: string) {
  const token = await issueEmailToken(userId, 'verify', 2 * DAY)
  await sendMail({
    to,
    subject: 'Verify your StarPay email',
    body: `Hi ${name}, confirm your email address to finish setting up your StarPay account. This link expires in 48 hours.`,
    actionPath: `/verify-email#${token}`,
  })
}

// A real hash of a throwaway value, so sign-in takes similar time for unknown emails.
const DUMMY_HASH = await Bun.password.hash('starpay-timing-equalizer-0')

export async function signup(ctx: Ctx) {
  rateLimit(`signup:${ctx.ip}`, 10, 60 * 60_000)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 100 })
  const mail = email(body)
  const pw = password(body, 'password', mail)
  const exists = await rows<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = ${mail} LIMIT 1`)
  if (exists.length) throw conflict('An account with this email already exists. Try signing in.')
  const hash = await Bun.password.hash(pw)
  const created = await rows<{ id: string }>(sql`
    INSERT INTO users (email, name, password_hash) VALUES (${mail}, ${name}, ${hash}) RETURNING id`)
  const userId = created[0]!.id
  await sendVerification(userId, mail, name)
  await audit(ctx, null, 'user.signup', { type: 'user', id: userId }, {}, userId)
  return createSession(ctx, userId)
}

export async function signin(ctx: Ctx) {
  const body = asBody(await ctx.body())
  const mail = email(body)
  rateLimit(`signin-ip:${ctx.ip}`, 30, 15 * 60_000)
  rateLimit(`signin:${mail}`, 8, 15 * 60_000)
  const pw = typeof body.password === 'string' ? body.password : ''
  const found = await rows<{ id: string; password_hash: string }>(sql`
    SELECT id, password_hash FROM users WHERE lower(email) = ${mail} AND deleted_at IS NULL LIMIT 1`)
  const row = found[0]
  const ok = await Bun.password.verify(pw, row?.password_hash || DUMMY_HASH)
  if (!row || !ok) throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials')
  await audit(ctx, null, 'user.signin', { type: 'user', id: row.id }, {}, row.id)
  return createSession(ctx, row.id)
}

export async function signout(ctx: Ctx) {
  const token = readCookie(ctx.req, SESSION_COOKIE)
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(ctx.req, '', 0) } })
}

export async function me(ctx: Ctx) {
  if (!ctx.user) return { user: null, workspaces: [] }
  const workspaces = await rows<{ id: string; name: string; slug: string; role: string; country: string }>(sql`
    SELECT w.id, w.name, w.slug, w.country, m.role
    FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${ctx.user.id} AND w.deleted_at IS NULL
    ORDER BY w.created_at`)
  return { user: ctx.user, workspaces }
}

export async function verifyEmail(ctx: Ctx) {
  rateLimit(`verify:${ctx.ip}`, 20, 15 * 60_000)
  const body = asBody(await ctx.body())
  const token = str(body, 'token', { max: 100 })
  const found = await rows<{ id: string; user_id: string }>(sql`
    UPDATE email_tokens SET used_at = now()
    WHERE token_hash = ${sha256(token)} AND kind = 'verify' AND used_at IS NULL AND expires_at > now()
    RETURNING id, user_id`)
  if (!found[0]) throw badRequest('This verification link is invalid or has expired. Request a new one.')
  await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${found[0].user_id}`
  await audit(ctx, null, 'user.email_verified', { type: 'user', id: found[0].user_id }, {}, found[0].user_id)
  return { ok: true }
}

export async function resendVerification(ctx: Ctx) {
  const user = requireUser(ctx)
  rateLimit(`resend:${user.id}`, 5, 60 * 60_000)
  if (user.emailVerified) return { ok: true }
  await sendVerification(user.id, user.email, user.name)
  return { ok: true }
}

export async function forgotPassword(ctx: Ctx) {
  rateLimit(`forgot:${ctx.ip}`, 10, 60 * 60_000)
  const body = asBody(await ctx.body())
  const mail = email(body)
  const found = await rows<{ id: string; name: string }>(sql`
    SELECT id, name FROM users WHERE lower(email) = ${mail} AND deleted_at IS NULL LIMIT 1`)
  if (found[0]) {
    const token = await issueEmailToken(found[0].id, 'reset', 60 * 60_000)
    await sendMail({
      to: mail,
      subject: 'Reset your StarPay password',
      body: `Hi ${found[0].name}, use the link below to choose a new password. It expires in one hour. If you did not ask for this, ignore this message.`,
      actionPath: `/reset-password#${token}`,
    })
    await audit(ctx, null, 'user.password_reset_requested', { type: 'user', id: found[0].id }, {}, found[0].id)
  }
  // Same answer whether or not the account exists.
  return { ok: true }
}

export async function resetPassword(ctx: Ctx) {
  rateLimit(`reset:${ctx.ip}`, 10, 15 * 60_000)
  const body = asBody(await ctx.body())
  const token = str(body, 'token', { max: 100 })
  const pw = password(body, 'password')
  const found = await rows<{ user_id: string }>(sql`
    UPDATE email_tokens SET used_at = now()
    WHERE token_hash = ${sha256(token)} AND kind = 'reset' AND used_at IS NULL AND expires_at > now()
    RETURNING user_id`)
  if (!found[0]) throw badRequest('This reset link is invalid or has expired. Request a new one.')
  const userId = found[0].user_id
  await sql`UPDATE users SET password_hash = ${await Bun.password.hash(pw)}, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${userId}`
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`
  await audit(ctx, null, 'user.password_reset', { type: 'user', id: userId }, {}, userId)
  return { ok: true }
}

export async function updateProfile(ctx: Ctx) {
  const user = requireUser(ctx)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 100 })
  const phone = str(body, 'phone', { max: 40, optional: true })
  if (phone && !/^\+?[0-9 ().-]{6,40}$/.test(phone)) throw badRequest('Enter a valid phone number, for example +1 415 555 0100.')
  const ctry = country(body, 'country', true)
  const locale = str(body, 'locale', { max: 20, optional: true }) || 'en'
  const timezone = str(body, 'timezone', { max: 60, optional: true }) || 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
  } catch {
    throw badRequest('Choose a valid time zone.')
  }
  await sql`
    UPDATE users SET name = ${name}, phone = ${phone || null}, country = ${ctry || null},
      locale = ${locale}, timezone = ${timezone} WHERE id = ${user.id}`
  await audit(ctx, null, 'user.profile_updated')
  return { ok: true }
}

export async function changePassword(ctx: Ctx) {
  const user = requireUser(ctx)
  rateLimit(`chpw:${user.id}`, 10, 15 * 60_000)
  const body = asBody(await ctx.body())
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const next = password(body, 'newPassword')
  const found = await rows<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${user.id}`)
  if (!(await Bun.password.verify(current, found[0]?.password_hash ?? DUMMY_HASH))) {
    throw new HttpError(400, 'Your current password is incorrect.', 'bad_credentials')
  }
  await sql`UPDATE users SET password_hash = ${await Bun.password.hash(next)} WHERE id = ${user.id}`
  // Keep this session, end every other one.
  const token = readCookie(ctx.req, SESSION_COOKIE)
  await sql`DELETE FROM sessions WHERE user_id = ${user.id} AND token_hash <> ${token ? sha256(token) : ''}`
  await audit(ctx, null, 'user.password_changed')
  return { ok: true }
}

export async function exportAccount(ctx: Ctx) {
  const user = requireUser(ctx)
  const memberships = await rows<Record<string, unknown>>(sql`
    SELECT w.id AS workspace_id, w.name AS workspace_name, m.role, m.created_at
    FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ${user.id}`)
  const activity = await rows<Record<string, unknown>>(sql`
    SELECT action, workspace_id, created_at FROM audit_logs WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 500`)
  return { exportedAt: new Date().toISOString(), profile: user, memberships, activity }
}

export async function deleteAccount(ctx: Ctx) {
  const user = requireUser(ctx)
  rateLimit(`delacct:${user.id}`, 5, 60 * 60_000)
  const body = asBody(await ctx.body())
  const pw = typeof body.password === 'string' ? body.password : ''
  const found = await rows<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${user.id}`)
  if (!(await Bun.password.verify(pw, found[0]?.password_hash ?? DUMMY_HASH))) throw unauthorized('Password is incorrect.')

  // Workspaces where this user is the only owner.
  const owned = await rows<{ id: string; name: string; members: number }>(sql`
    SELECT w.id, w.name, (SELECT count(*)::int FROM memberships x WHERE x.workspace_id = w.id) AS members
    FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${user.id} AND m.role = 'owner' AND w.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.workspace_id = w.id AND o.role = 'owner' AND o.user_id <> ${user.id})`)
  const blocking = owned.filter((w) => w.members > 1)
  if (blocking.length) {
    throw conflict(
      `Make another member an owner of ${blocking.map((w) => w.name).join(', ')} first, or remove its other members, then delete your account.`,
    )
  }
  for (const w of owned) {
    await sql`UPDATE workspaces SET deleted_at = now() WHERE id = ${w.id}`
    await audit(ctx, w.id, 'workspace.deleted_with_owner_account', { type: 'workspace', id: w.id })
  }
  await sql`DELETE FROM sessions WHERE user_id = ${user.id}`
  await sql`DELETE FROM memberships WHERE user_id = ${user.id}`
  await sql`DELETE FROM email_tokens WHERE user_id = ${user.id}`
  await sql`DELETE FROM dev_outbox WHERE lower(to_email) = ${user.email.toLowerCase()}`
  await sql`
    UPDATE users SET deleted_at = now(), name = 'Deleted user', phone = NULL, country = NULL,
      password_hash = '', email = ${`deleted+${user.id}@deleted.invalid`} WHERE id = ${user.id}`
  await audit(ctx, null, 'user.deleted', { type: 'user', id: user.id }, {}, user.id)
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(ctx.req, '', 0) } })
}

