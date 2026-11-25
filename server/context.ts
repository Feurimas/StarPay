import type { Role } from '../src/lib/permissions'
import { can, type Permission } from '../src/lib/permissions'
import { rows, sql } from './db'
import { forbidden, notFound, readCookie, sha256, SESSION_COOKIE, unauthorized, isUuid } from './http'

export interface AuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  phone: string | null
  country: string | null
  locale: string
  timezone: string
}

export interface Ctx {
  req: Request
  url: URL
  params: Record<string, string>
  ip: string
  body: () => Promise<unknown>
  user?: AuthUser
}

interface UserRow {
  id: string
  email: string
  name: string
  email_verified_at: Date | null
  phone: string | null
  country: string | null
  locale: string
  timezone: string
}

export const toAuthUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  name: r.name,
  emailVerified: !!r.email_verified_at,
  phone: r.phone,
  country: r.country,
  locale: r.locale,
  timezone: r.timezone,
})

export async function loadUser(req: Request): Promise<AuthUser | undefined> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return undefined
  const found = await rows<UserRow>(sql`
    SELECT u.id, u.email, u.name, u.email_verified_at, u.phone, u.country, u.locale, u.timezone
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now() AND u.deleted_at IS NULL
    LIMIT 1`)
  return found[0] ? toAuthUser(found[0]) : undefined
}

export function requireUser(ctx: Ctx): AuthUser {
  if (!ctx.user) throw unauthorized()
  return ctx.user
}

export interface WorkspaceRow {
  id: string
  name: string
  slug: string
  legal_name: string | null
  business_type: string | null
  country: string
  region: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  website: string | null
  support_email: string | null
  timezone: string
  locale: string
  date_format: string
  number_format: string
  display_currency: string
  created_at: Date
}

export interface Membership {
  workspace: WorkspaceRow
  role: Role
  user: AuthUser
}

/**
 * Every workspace-scoped route goes through here. A user who is not a member gets a 404,
 * never a 403, so workspace ids cannot be probed. This is the organization isolation boundary.
 */
export async function requireMember(ctx: Ctx, permission?: Permission): Promise<Membership> {
  const user = requireUser(ctx)
  const id = ctx.params.wid ?? ''
  if (!isUuid(id)) throw notFound('Workspace not found.')
  const found = await rows<WorkspaceRow & { role: Role }>(sql`
    SELECT w.*, m.role
    FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
    WHERE w.id = ${id} AND m.user_id = ${user.id} AND w.deleted_at IS NULL
    LIMIT 1`)
  const row = found[0]
  if (!row) throw notFound('Workspace not found.')
  if (permission && !can(row.role, permission)) throw forbidden()
  const { role, ...workspace } = row
  return { workspace, role, user }
}

export async function audit(
  ctx: Ctx,
  workspaceId: string | null,
  action: string,
  target?: { type?: string; id?: string },
  metadata: Record<string, unknown> = {},
  userId?: string,
): Promise<void> {
  await sql`
    INSERT INTO audit_logs (workspace_id, user_id, action, target_type, target_id, metadata, ip)
    VALUES (${workspaceId}, ${userId ?? ctx.user?.id ?? null}, ${action}, ${target?.type ?? null},
            ${target?.id ?? null}, ${JSON.stringify(metadata)}::text::jsonb, ${ctx.ip})`
}

export const workspaceDto = (w: WorkspaceRow) => ({
  id: w.id,
  name: w.name,
  slug: w.slug,
  legalName: w.legal_name,
  businessType: w.business_type,
  country: w.country,
  region: w.region,
  addressLine1: w.address_line1,
  addressLine2: w.address_line2,
  city: w.city,
  postalCode: w.postal_code,
  phone: w.phone,
  website: w.website,
  supportEmail: w.support_email,
  timezone: w.timezone,
  locale: w.locale,
  dateFormat: w.date_format,
  numberFormat: w.number_format,
  displayCurrency: w.display_currency,
  createdAt: w.created_at,
})
