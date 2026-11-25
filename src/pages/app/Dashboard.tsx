import { BarChart3, CheckCircle2, Circle, CreditCard, LineChart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { formatNumber, relativeTime } from '@/lib/format'
import { fmtUsdc } from '@/lib/usdc'
import { ROLE_LABELS } from '@/lib/permissions'

interface DashboardData {
  members: number
  pendingInvitations: number
  steps: { id: string; done: boolean }[]
  orders: { total: number; open: number; fulfilled: number; orderValue: string; unpaid: number }
  recent: { action: string; actor: string | null; at: string }[]
}

const ACTION_LABELS: Record<string, string> = {
  'workspace.created': 'created the workspace',
  'workspace.updated': 'updated business settings',
  'team.invited': 'invited a teammate',
  'team.invitation_accepted': 'joined the workspace',
  'team.invitation_revoked': 'revoked an invitation',
  'team.role_changed': 'changed a member role',
  'team.member_removed': 'removed a member',
  'team.left': 'left the workspace',
  'product.created': 'added a product',
  'product.updated': 'updated a product',
  'product.archived': 'archived a product',
  'storefront.published': 'published the storefront',
  'storefront.saved': 'saved the storefront',
  'order.created': 'created an order',
  'order.status_changed': 'updated an order',
  'invoice.created': 'issued an invoice',
  'customer.created': 'added a customer',
  'discount.created': 'created a discount',
  'workflow.created': 'created a workflow',
  'knowledge.created': 'added a knowledge article',
  'payout.set': 'set the payout wallet',
  'payment.verified': 'had a USDC payment verified onchain',
  'ai.settings_updated': 'updated AI settings',
}

/** Unknown actions read as plain words, never as raw event keys. */
const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ')

const MODULES = [
  { name: 'Pay', icon: CreditCard, text: 'USDC payment requests and verified payments on Arc.', phase: 'Phase 3' },
  { name: 'Insights', icon: LineChart, text: 'Sales and payment analytics from real records.', phase: 'Phase 5' },
]

const STEP_COPY: Record<string, { title: string; text: string; to: (wid: string) => string }> = {
  'verify-email': { title: 'Verify your email', text: 'Confirm your address to secure your account.', to: (w) => `/app/${w}/account` },
  'business-profile': { title: 'Complete your business profile', text: 'Add your legal name, address and support email.', to: (w) => `/app/${w}/settings` },
  'add-product': { title: 'Add your first product', text: 'Create an active product with a price in USDC.', to: (w) => `/app/${w}/products/new` },
  'publish-store': { title: 'Publish your storefront', text: 'Turn on your public store page and share the link.', to: (w) => `/app/${w}/storefront` },
  'invite-team': { title: 'Invite a teammate', text: 'Add people with the right role for their job.', to: (w) => `/app/${w}/team` },
}

export default function Dashboard() {
  const { user } = useAuth()
  const { workspace, role, prefs } = useWorkspace()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    api.get<DashboardData>(`/workspaces/${workspace.id}/dashboard`).then(setData).catch(() => undefined)
  }, [workspace.id])

  if (!data) return <Spinner label="Loading dashboard" />
  const remaining = data.steps.filter((s) => !s.done)

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name.split(' ')[0] ?? ''}`}
        description={`${workspace.name} workspace. You are signed in as ${ROLE_LABELS[role]}.`}
        action={<Link to={`/app/${workspace.id}/insights`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-muted"><BarChart3 className="h-4 w-4" aria-hidden /> Open insights</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Open orders', value: formatNumber(data.orders.open, prefs), note: `${formatNumber(data.orders.total, prefs)} total, ${formatNumber(data.orders.fulfilled, prefs)} fulfilled` },
          { label: 'Order value (USDC)', value: fmtUsdc(data.orders.orderValue, false), note: 'From order records, excluding cancelled. Not verified payments.' },
          { label: 'Unpaid orders', value: formatNumber(data.orders.unpaid, prefs), note: `${formatNumber(data.members, prefs)} team member${data.members === 1 ? '' : 's'}${data.pendingInvitations ? `, ${data.pendingInvitations} invited` : ''}` },
        ].map((c) => (
          <Card key={c.label} className="p-5">
            <p className="text-sm font-medium text-muted">{c.label}</p>
            <p className="display mt-2 text-3xl font-semibold tabular-nums">{c.value}</p>
            {c.note && <p className="mt-1 text-xs text-subtle">{c.note}</p>}
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Get started" description={remaining.length ? `${remaining.length} step${remaining.length === 1 ? '' : 's'} left to finish setup.` : 'Setup is complete.'} />
          <ul className="divide-y divide-line">
            {data.steps.map((s) => {
              const copy = STEP_COPY[s.id]
              return (
                <li key={s.id}>
                  <Link to={copy.to(workspace.id)} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-surface-muted sm:px-6">
                    {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-subtle" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${s.done ? 'text-muted line-through' : ''}`}>{copy.title}</span>
                      <span className="block text-xs text-muted">{copy.text}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          {data.recent.length === 0 ? (
            <EmptyState icon={<Circle className="h-5 w-5" />} title="No activity yet" description="Workspace changes are recorded here." />
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <span className="min-w-0 text-pretty">
                    <span className="font-semibold">{r.actor ?? 'Someone'}</span> {actionLabel(r.action)}
                  </span>
                  <span className="shrink-0 text-xs text-subtle">{relativeTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="StarPay roadmap" description="These modules are being built in phases. Nothing below is live yet, and no sample data is shown." />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.name} className="bg-surface p-5">
              <div className="flex items-center justify-between">
                <m.icon className="h-5 w-5 text-brand" aria-hidden />
                <Badge tone="neutral">{m.phase}</Badge>
              </div>
              <p className="display mt-3 font-semibold">StarPay {m.name}</p>
              <p className="mt-1 text-sm text-muted text-pretty">{m.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
