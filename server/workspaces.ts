import { INVITABLE_ROLES, ROLES, assignableRoles, type Role } from '../src/lib/permissions'
import { audit, requireMember, requireUser, workspaceDto, type Ctx } from './context'
import { rows, sql } from './db'
import {
  asBody,
  badRequest,
  conflict,
  country,
  email,
  forbidden,
  isUuid,
  newToken,
  notFound,
  oneOf,
  rateLimit,
  sha256,
  str,
} from './http'
import { sendMail } from './mail'
import { usd } from './money'

const DAY = 86_400_000

function slugify(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${base || 'business'}-${newToken().slice(0, 5).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`
}

async function assertCountryAllowed(code: string) {
  const blocked = await rows<{ code: string }>(sql`SELECT code FROM restricted_countries WHERE code = ${code}`)
  if (blocked.length) {
    throw new Error('RESTRICTED')
  }
}

async function guardCountry(code: string) {
  try {
    await assertCountryAllowed(code)
  } catch {
    throw forbidden('StarPay is not available for businesses in this jurisdiction.')
  }
}

export async function createWorkspace(ctx: Ctx) {
  const user = requireUser(ctx)
  rateLimit(`mkws:${user.id}`, 10, 60 * 60_000)
  const body = asBody(await ctx.body())
  const name = str(body, 'name', { min: 2, max: 80 })
  const ctry = country(body)
  const businessType = str(body, 'businessType', { max: 40, optional: true })
  await guardCountry(ctry)
  const created = await rows<{ id: string }>(sql`
    INSERT INTO workspaces (name, slug, country, business_type, timezone, locale, created_by)
    VALUES (${name}, ${slugify(name)}, ${ctry}, ${businessType || null}, ${user.timezone}, ${user.locale}, ${user.id})
    RETURNING id`)
  const id = created[0]!.id
  await sql`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${id}, ${user.id}, 'owner')`
  await audit(ctx, id, 'workspace.created', { type: 'workspace', id }, { name })
  return { id }
}

export async function getWorkspace(ctx: Ctx) {
  const m = await requireMember(ctx)
  return { workspace: workspaceDto(m.workspace), role: m.role }
}

export async function updateWorkspace(ctx: Ctx) {
  const m = await requireMember(ctx, 'workspace.update')
  const body = asBody(await ctx.body())
  const opt = (key: string, max = 200) => str(body, key, { max, optional: true }) || null
  const name = str(body, 'name', { min: 2, max: 80 })
  const ctry = country(body)
  if (ctry !== m.workspace.country) await guardCountry(ctry)
  const timezone = str(body, 'timezone', { max: 60 })
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
  } catch {
    throw badRequest('Choose a valid time zone.')
  }
  const phone = opt('phone', 40)
  if (phone && !/^\+?[0-9 ().-]{6,40}$/.test(phone)) throw badRequest('Enter a valid phone number, for example +1 415 555 0100.')
  const supportEmail = opt('supportEmail', 254)
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(supportEmail)) throw badRequest('Enter a valid support email.')
  const website = opt('website', 200)
  if (website && !/^https?:\/\/[^\s]+$/i.test(website)) throw badRequest('Website must start with http:// or https://')
  const displayCurrency = oneOf(body, 'displayCurrency', ['USD'] as const)
  const dateFormat = oneOf(body, 'dateFormat', ['auto', 'mdy', 'dmy', 'ymd'] as const)
  const numberFormat = oneOf(body, 'numberFormat', ['auto', 'en-US', 'de-DE', 'fr-FR', 'en-IN'] as const)
  const locale = oneOf(body, 'locale', ['en'] as const)
  await sql`
    UPDATE workspaces SET
      name = ${name}, legal_name = ${opt('legalName', 120)}, business_type = ${opt('businessType', 40)},
      country = ${ctry}, region = ${opt('region', 80)}, address_line1 = ${opt('addressLine1')},
      address_line2 = ${opt('addressLine2')}, city = ${opt('city', 80)}, postal_code = ${opt('postalCode', 20)},
      phone = ${phone}, website = ${website}, support_email = ${supportEmail},
      timezone = ${timezone}, locale = ${locale}, date_format = ${dateFormat},
      number_format = ${numberFormat}, display_currency = ${displayCurrency}
    WHERE id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'workspace.updated', { type: 'workspace', id: m.workspace.id })
  return { ok: true }
}

export async function deleteWorkspace(ctx: Ctx) {
  const m = await requireMember(ctx, 'workspace.delete')
  const body = asBody(await ctx.body())
  if (str(body, 'confirmName') !== m.workspace.name) throw badRequest('Type the workspace name exactly to confirm.')
  await sql`UPDATE workspaces SET deleted_at = now() WHERE id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'workspace.deleted', { type: 'workspace', id: m.workspace.id })
  return { ok: true }
}

export async function listMembers(ctx: Ctx) {
  const m = await requireMember(ctx, 'team.view')
  const members = await rows<{ user_id: string; name: string; email: string; role: Role; created_at: Date }>(sql`
    SELECT u.id AS user_id, u.name, u.email, mm.role, mm.created_at
    FROM memberships mm JOIN users u ON u.id = mm.user_id
    WHERE mm.workspace_id = ${m.workspace.id} AND u.deleted_at IS NULL
    ORDER BY mm.created_at`)
  const invitations = await rows<{ id: string; email: string; role: string; expires_at: Date; created_at: Date }>(sql`
    SELECT id, email, role, expires_at, created_at FROM invitations
    WHERE workspace_id = ${m.workspace.id} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC`)
  return {
    me: m.user.id,
    myRole: m.role,
    members: members.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, role: r.role, joinedAt: r.created_at })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, createdAt: i.created_at })),
  }
}

export async function inviteMember(ctx: Ctx) {
  const m = await requireMember(ctx, 'team.invite')
  rateLimit(`invite:${m.user.id}`, 30, 60 * 60_000)
  const body = asBody(await ctx.body())
  const mail = email(body)
  const role = oneOf(body, 'role', INVITABLE_ROLES)
  if (!assignableRoles(m.role).includes(role)) throw forbidden('You cannot invite someone with that role.')
  const already = await rows<{ id: string }>(sql`
    SELECT u.id FROM users u JOIN memberships mm ON mm.user_id = u.id
    WHERE lower(u.email) = ${mail} AND mm.workspace_id = ${m.workspace.id} LIMIT 1`)
  if (already.length) throw conflict('That person is already a member of this workspace.')
  await sql`UPDATE invitations SET revoked_at = now() WHERE workspace_id = ${m.workspace.id} AND lower(email) = ${mail} AND accepted_at IS NULL AND revoked_at IS NULL`
  const token = newToken()
  const created = await rows<{ id: string }>(sql`
    INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
    VALUES (${m.workspace.id}, ${mail}, ${role}, ${sha256(token)}, ${m.user.id}, ${new Date(Date.now() + 7 * DAY)})
    RETURNING id`)
  await sendMail({
    to: mail,
    subject: `${m.user.name} invited you to ${m.workspace.name} on StarPay`,
    body: `You have been invited to join ${m.workspace.name} as ${role}. The invitation expires in 7 days.`,
    actionPath: `/invite#${token}`,
  })
  await audit(ctx, m.workspace.id, 'team.invited', { type: 'invitation', id: created[0]!.id }, { email: mail, role })
  return { id: created[0]!.id }
}

export async function revokeInvitation(ctx: Ctx) {
  const m = await requireMember(ctx, 'team.manage')
  const iid = ctx.params.iid ?? ''
  if (!isUuid(iid)) throw notFound()
  const done = await rows<{ id: string }>(sql`
    UPDATE invitations SET revoked_at = now()
    WHERE id = ${iid} AND workspace_id = ${m.workspace.id} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`)
  if (!done[0]) throw notFound('Invitation not found.')
  await audit(ctx, m.workspace.id, 'team.invitation_revoked', { type: 'invitation', id: iid })
  return { ok: true }
}

export async function lookupInvitation(ctx: Ctx) {
  rateLimit(`invlookup:${ctx.ip}`, 30, 15 * 60_000)
  const body = asBody(await ctx.body())
  const token = str(body, 'token', { max: 100 })
  const found = await rows<{ email: string; role: string; workspace_name: string }>(sql`
    SELECT i.email, i.role, w.name AS workspace_name
    FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.token_hash = ${sha256(token)} AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now() AND w.deleted_at IS NULL LIMIT 1`)
  if (!found[0]) throw notFound('This invitation is invalid, expired or was revoked.')
  return { email: found[0].email, role: found[0].role, workspaceName: found[0].workspace_name }
}

export async function acceptInvitation(ctx: Ctx) {
  const user = requireUser(ctx)
  rateLimit(`invaccept:${user.id}`, 20, 15 * 60_000)
  const body = asBody(await ctx.body())
  const token = str(body, 'token', { max: 100 })
  const found = await rows<{ id: string; workspace_id: string; email: string; role: Role }>(sql`
    SELECT i.id, i.workspace_id, i.email, i.role
    FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.token_hash = ${sha256(token)} AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now() AND w.deleted_at IS NULL LIMIT 1`)
  const inv = found[0]
  if (!inv) throw notFound('This invitation is invalid, expired or was revoked.')
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email address to accept it.`)
  }
  if (!user.emailVerified) throw forbidden('Verify your email address before accepting an invitation.')
  await sql`
    INSERT INTO memberships (workspace_id, user_id, role) VALUES (${inv.workspace_id}, ${user.id}, ${inv.role})
    ON CONFLICT (workspace_id, user_id) DO NOTHING`
  await sql`UPDATE invitations SET accepted_at = now() WHERE id = ${inv.id}`
  await audit(ctx, inv.workspace_id, 'team.invitation_accepted', { type: 'invitation', id: inv.id }, { role: inv.role })
  return { workspaceId: inv.workspace_id }
}

async function ownerCount(workspaceId: string): Promise<number> {
  const r = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM memberships WHERE workspace_id = ${workspaceId} AND role = 'owner'`)
  return r[0]?.n ?? 0
}

export async function changeRole(ctx: Ctx) {
  const m = await requireMember(ctx, 'team.manage')
  const uid = ctx.params.uid ?? ''
  if (!isUuid(uid)) throw notFound()
  const body = asBody(await ctx.body())
  const role = oneOf(body, 'role', ROLES)
  const target = await rows<{ role: Role }>(sql`SELECT role FROM memberships WHERE workspace_id = ${m.workspace.id} AND user_id = ${uid}`)
  if (!target[0]) throw notFound('Member not found.')
  if (uid === m.user.id) throw forbidden('You cannot change your own role.')
  const allowed = assignableRoles(m.role)
  if (!allowed.includes(role) || !allowed.includes(target[0].role)) throw forbidden('You cannot change that member to this role.')
  await sql`UPDATE memberships SET role = ${role} WHERE workspace_id = ${m.workspace.id} AND user_id = ${uid}`
  await audit(ctx, m.workspace.id, 'team.role_changed', { type: 'user', id: uid }, { from: target[0].role, to: role })
  return { ok: true }
}

export async function removeMember(ctx: Ctx) {
  const m = await requireMember(ctx, 'team.view')
  const uid = ctx.params.uid ?? ''
  if (!isUuid(uid)) throw notFound()
  const target = await rows<{ role: Role }>(sql`SELECT role FROM memberships WHERE workspace_id = ${m.workspace.id} AND user_id = ${uid}`)
  if (!target[0]) throw notFound('Member not found.')
  const self = uid === m.user.id
  if (!self) {
    if (!assignableRoles(m.role).includes(target[0].role)) throw forbidden('You cannot remove this member.')
  }
  if (target[0].role === 'owner' && (await ownerCount(m.workspace.id)) <= 1) {
    throw conflict('A workspace needs at least one owner. Make someone else an owner first.')
  }
  await sql`DELETE FROM memberships WHERE workspace_id = ${m.workspace.id} AND user_id = ${uid}`
  await audit(ctx, m.workspace.id, self ? 'team.left' : 'team.member_removed', { type: 'user', id: uid })
  return { ok: true }
}

export async function listAudit(ctx: Ctx) {
  const m = await requireMember(ctx, 'audit.view')
  const entries = await rows<{ id: string; action: string; user_name: string | null; target_type: string | null; metadata: unknown; created_at: Date }>(sql`
    SELECT a.id::text, a.action, u.name AS user_name, a.target_type, a.metadata, a.created_at
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.workspace_id = ${m.workspace.id} ORDER BY a.created_at DESC, a.id DESC LIMIT 50`)
  return {
    entries: entries.map((e) => ({ id: e.id, action: e.action, actor: e.user_name, targetType: e.target_type, at: e.created_at })),
  }
}

export async function dashboard(ctx: Ctx) {
  const m = await requireMember(ctx)
  const counts = await rows<{ members: number; pending: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM memberships WHERE workspace_id = ${m.workspace.id}) AS members,
      (SELECT count(*)::int FROM invitations WHERE workspace_id = ${m.workspace.id} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()) AS pending`)
  const w = m.workspace
  const commerce = await rows<{ products: number; published: boolean; orders: number; pending: number; fulfilled: number; value: unknown; unpaid: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM products WHERE workspace_id = ${w.id} AND status = 'active') AS products,
      COALESCE((SELECT published FROM storefronts WHERE workspace_id = ${w.id}), false) AS published,
      (SELECT count(*)::int FROM orders WHERE workspace_id = ${w.id}) AS orders,
      (SELECT count(*)::int FROM orders WHERE workspace_id = ${w.id} AND status IN ('pending','processing')) AS pending,
      (SELECT count(*)::int FROM orders WHERE workspace_id = ${w.id} AND status = 'fulfilled') AS fulfilled,
      (SELECT COALESCE(sum(total_units), 0) FROM orders WHERE workspace_id = ${w.id} AND status <> 'cancelled') AS value,
      (SELECT count(*)::int FROM orders WHERE workspace_id = ${w.id} AND status <> 'cancelled' AND payment_status = 'unpaid') AS unpaid`)
  const c = commerce[0]!
  const profileDone = !!(w.legal_name && w.address_line1 && w.city && w.support_email)
  const recent = await rows<{ action: string; user_name: string | null; created_at: Date }>(sql`
    SELECT a.action, u.name AS user_name, a.created_at
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.workspace_id = ${w.id} ORDER BY a.created_at DESC, a.id DESC LIMIT 6`)
  return {
    members: counts[0]?.members ?? 1,
    pendingInvitations: counts[0]?.pending ?? 0,
    steps: [
      { id: 'verify-email', done: m.user.emailVerified },
      { id: 'business-profile', done: profileDone },
      { id: 'add-product', done: c.products > 0 },
      { id: 'publish-store', done: c.published },
      { id: 'invite-team', done: (counts[0]?.members ?? 1) > 1 || (counts[0]?.pending ?? 0) > 0 },
    ],
    orders: { total: c.orders, open: c.pending, fulfilled: c.fulfilled, orderValue: usd(c.value), unpaid: c.unpaid },
    recent: recent.map((r) => ({ action: r.action, actor: r.user_name, at: r.created_at })),
  }
}
