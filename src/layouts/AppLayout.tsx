import { Tag, BarChart3, Bell, BookOpen, Bot, Building2, Check, Inbox as InboxIcon, Workflow as WorkflowIcon, ChevronsUpDown, CreditCard, FileText, LayoutDashboard, LogOut, Menu, Package, Percent, Plus, Receipt, Settings, Store, Wallet as WalletIcon, UserCircle, Users, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { WorkspaceProvider, useWorkspace } from '@/auth/WorkspaceContext'
import { Logo } from '@/components/Logo'
import { LiveChatSupport } from '@/components/LiveChatSupport'
import { Alert, Button, EmptyState, Modal, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/useApi'
import { ROLE_LABELS } from '@/lib/permissions'
import { DevMailbox } from '@/pages/auth/DevMailbox'
import { clsx } from 'clsx'
import { toast } from 'sonner'

function WorkspaceSwitcher() {
  const { workspaces } = useAuth()
  const { workspace, role } = useWorkspace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 text-left hover:bg-surface-muted"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-soft text-violet">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{workspace.name}</span>
          <span className="block text-xs text-muted">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-subtle" aria-hidden />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-14 z-30 rounded-xl border border-line bg-surface p-1.5 shadow-card">
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="option"
              aria-selected={w.id === workspace.id}
              onClick={() => {
                setOpen(false)
                void navigate(`/app/${w.id}/dashboard`)
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-surface-muted"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
              {w.id === workspace.id && <Check className="h-4 w-4 text-brand" aria-hidden />}
            </button>
          ))}
          <Link to="/app/new" onClick={() => setOpen(false)} className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border-t border-line px-2.5 pt-1 text-sm font-semibold text-brand hover:bg-surface-muted">
            <Plus className="h-4 w-4" aria-hidden /> New business
          </Link>
        </div>
      )}
    </div>
  )
}

function NavItem({ to, icon: Icon, label, onNavigate, badge }: { to: string; icon: typeof LayoutDashboard; label: string; onNavigate?: () => void; badge?: number }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
          isActive ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted',
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
      {badge ? <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">{badge}</span> : null}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { workspace, can } = useWorkspace()
  const base = `/app/${workspace.id}`
  const unread = useApi<{ unread: number }>(`/workspaces/${workspace.id}/notifications`)
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to={`${base}/dashboard`} onClick={onNavigate} className="px-1 pt-1" aria-label="StarPay dashboard">
        <Logo />
      </Link>
      <WorkspaceSwitcher />
      <nav className="flex flex-col gap-1" aria-label="Main">
        <NavItem to={`${base}/dashboard`} icon={LayoutDashboard} label="Dashboard" onNavigate={onNavigate} />
        <NavItem to={`${base}/insights`} icon={BarChart3} label="Insights" onNavigate={onNavigate} />
        <p className="eyebrow mb-1 mt-4 px-3">Commerce</p>
        <NavItem to={`${base}/orders`} icon={Receipt} label="Orders" onNavigate={onNavigate} />
        <NavItem to={`${base}/products`} icon={Package} label="Products" onNavigate={onNavigate} />
        <NavItem to={`${base}/categories`} icon={Tag} label="Categories" onNavigate={onNavigate} />
        <NavItem to={`${base}/payments`} icon={CreditCard} label="Payments" onNavigate={onNavigate} />
        <NavItem to={`${base}/customers`} icon={UsersRound} label="Customers" onNavigate={onNavigate} />
        <NavItem to={`${base}/invoices`} icon={FileText} label="Invoices" onNavigate={onNavigate} />
        <NavItem to={`${base}/discounts`} icon={Percent} label="Discounts" onNavigate={onNavigate} />
        <NavItem to={`${base}/storefront`} icon={Store} label="Storefront" onNavigate={onNavigate} />
        <p className="eyebrow mb-1 mt-4 px-3">AI and support</p>
        <NavItem to={`${base}/assistant`} icon={Bot} label="AI assistant" onNavigate={onNavigate} />
        <NavItem to={`${base}/inbox`} icon={InboxIcon} label="Inbox" onNavigate={onNavigate} />
        <NavItem to={`${base}/knowledge`} icon={BookOpen} label="Knowledge base" onNavigate={onNavigate} />
        <NavItem to={`${base}/workflows`} icon={WorkflowIcon} label="Workflows" onNavigate={onNavigate} />
        <NavItem to={`${base}/notifications`} icon={Bell} label="Notifications" onNavigate={onNavigate} badge={unread.data?.unread} />
        <p className="eyebrow mb-1 mt-4 px-3">Workspace</p>
        <NavItem to={`${base}/wallet`} icon={WalletIcon} label="Wallet" onNavigate={onNavigate} />
        <NavItem to={`${base}/team`} icon={Users} label="Team" onNavigate={onNavigate} />
        {can('workspace.update') && <NavItem to={`${base}/settings`} icon={Settings} label="Business settings" onNavigate={onNavigate} />}
        <p className="eyebrow mb-1 mt-4 px-3">You</p>
        <NavItem to={`${base}/account`} icon={UserCircle} label="Account" onNavigate={onNavigate} />
      </nav>
    </div>
  )
}

function VerifyBanner() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [tick, setTick] = useState(0)
  if (!user || user.emailVerified) return null

  const resend = async () => {
    setSending(true)
    try {
      await api.post('/auth/resend-verification')
      setTick((t) => t + 1)
      toast.success('Verification email sent.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="border-b border-line bg-warning-soft px-4 py-2.5 text-sm text-warning">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <span>Verify {user.email} to accept invitations and secure your account.</span>
          <span className="flex items-center gap-3 font-semibold">
            <button onClick={() => setOpen(true)} className="underline-offset-2 hover:underline">
              Open verification email
            </button>
            <button onClick={() => void resend()} disabled={sending} className="underline-offset-2 hover:underline disabled:opacity-60">
              Resend
            </button>
          </span>
        </div>
      </div>
      <Modal open={open} title="Verification email" onClose={() => setOpen(false)}>
        <DevMailbox email={user.email} refreshKey={tick} />
      </Modal>
    </>
  )
}

function Shell() {
  const { user, signOut } = useAuth()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block print:hidden">
        <SidebarContent />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onMouseDown={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <aside onMouseDown={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 w-[18rem] max-w-[85vw] bg-surface shadow-2xl">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-muted">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 print:hidden flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-muted lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-semibold lg:hidden">{workspace.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate('/signin', { replace: true }))
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </Button>
          </div>
        </header>
        <VerifyBanner />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
        <LiveChatSupport />
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { wid } = useParams()
  return (
    <WorkspaceProvider
      key={wid}
      workspaceId={wid ?? ''}
      fallback={<Spinner label="Loading workspace" />}
      notFound={
        <div className="mx-auto max-w-md px-4 py-24">
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="Workspace not found"
            description="It may have been deleted, or you may not have access to it."
            action={
              <Link to="/app">
                <Button>Go to my workspaces</Button>
              </Link>
            }
          />
          <Alert tone="info">Each business workspace is private to its members.</Alert>
        </div>
      }
    >
      <Shell />
    </WorkspaceProvider>
  )
}
