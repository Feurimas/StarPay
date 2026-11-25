// Role-based permissions shared by the API (enforcement) and the UI (hiding controls).
// The server is always the source of truth: the UI only uses this to avoid showing dead buttons.

export const ROLES = ['owner', 'admin', 'manager', 'support', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const INVITABLE_ROLES = ['admin', 'manager', 'support', 'viewer'] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  support: 'Support',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full control, including workspace deletion and ownership.',
  admin: 'Manages settings, team members and all business data.',
  manager: 'Manages products, orders, customers and invoices.',
  support: 'Handles customer conversations and views orders.',
  viewer: 'Read-only access to business data.',
}

export type Permission =
  | 'workspace.view'
  | 'workspace.update'
  | 'workspace.delete'
  | 'team.view'
  | 'team.invite'
  | 'team.manage'
  | 'audit.view'
  | 'products.view'
  | 'products.manage'
  | 'orders.view'
  | 'orders.manage'
  | 'customers.view'
  | 'customers.manage'
  | 'storefront.manage'
  | 'discounts.manage'
  | 'invoices.manage'
  | 'payments.view'
  | 'payments.manage'
  | 'payout.manage'
  | 'ai.use'
  | 'ai.settings'
  | 'knowledge.view'
  | 'knowledge.manage'
  | 'support.view'
  | 'support.manage'
  | 'workflows.view'
  | 'workflows.run'
  | 'workflows.manage'

const MATRIX: Record<Permission, readonly Role[]> = {
  'workspace.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'workspace.update': ['owner', 'admin'],
  'workspace.delete': ['owner'],
  'team.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'team.invite': ['owner', 'admin'],
  'team.manage': ['owner', 'admin'],
  'audit.view': ['owner', 'admin'],
  'products.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'products.manage': ['owner', 'admin', 'manager'],
  'orders.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'orders.manage': ['owner', 'admin', 'manager'],
  'customers.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'customers.manage': ['owner', 'admin', 'manager', 'support'],
  'storefront.manage': ['owner', 'admin', 'manager'],
  'discounts.manage': ['owner', 'admin', 'manager'],
  'invoices.manage': ['owner', 'admin', 'manager'],
  'payments.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'payments.manage': ['owner', 'admin', 'manager'],
  'payout.manage': ['owner', 'admin'],
  'ai.use': ['owner', 'admin', 'manager', 'support'],
  'ai.settings': ['owner', 'admin'],
  'knowledge.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'knowledge.manage': ['owner', 'admin', 'manager'],
  'support.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'support.manage': ['owner', 'admin', 'manager', 'support'],
  'workflows.view': ['owner', 'admin', 'manager', 'support', 'viewer'],
  'workflows.run': ['owner', 'admin', 'manager'],
  'workflows.manage': ['owner', 'admin'],
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && MATRIX[permission].includes(role)
}

/** Which roles a given actor may assign to others. Only owners may grant owner or admin. */
export function assignableRoles(actor: Role | undefined | null): Role[] {
  if (actor === 'owner') return [...ROLES]
  if (actor === 'admin') return ['manager', 'support', 'viewer']
  return []
}
