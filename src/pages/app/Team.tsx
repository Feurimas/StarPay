import { MailPlus, Trash2, UserMinus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { assignableRoles, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/permissions'
import { DevMailbox } from '@/pages/auth/DevMailbox'
import { useNavigate } from 'react-router-dom'

interface Member {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: string
}
interface Invitation {
  id: string
  email: string
  role: Role
  expiresAt: string
}
interface TeamData {
  me: string
  myRole: Role
  members: Member[]
  invitations: Invitation[]
}

export default function Team() {
  const { workspace, can, prefs } = useWorkspace()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<TeamData | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [inviteError, setInviteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const base = `/workspaces/${workspace.id}`

  const load = useCallback(async () => {
    setData(await api.get<TeamData>(`${base}/members`))
  }, [base])

  useEffect(() => {
    let cancelled = false
    api
      .get<TeamData>(`/workspaces/${workspace.id}/members`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  if (!data) return <Spinner label="Loading team" />
  const myRole = data?.myRole || 'owner';
  const invitable = assignableRoles(myRole).filter((r) => r !== 'owner')

  const act = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      toast.success(success)
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setInviteError('')
    try {
      await api.post(`${base}/invitations`, { email, role })
      setSentTo(email)
      setEmail('')
      await load()
    } catch (err) {
      setInviteError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const closeInvite = () => {
    setInviteOpen(false)
    setSentTo('')
    setInviteError('')
  }

  const leave = async () => {
    await api.delete(`${base}/members/${data.me}`)
    await refresh()
    void navigate('/app', { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite people and give each one only the access their job needs."
        action={
          can('team.invite') && (
            <Button
              onClick={() => {
                setRole(invitable[invitable.length - 1] ?? 'viewer')
                setInviteOpen(true)
              }}
            >
              <MailPlus className="h-4 w-4" aria-hidden /> Invite member
            </Button>
          )
        }
      />

      <Card>
        <CardHeader title={`Members (${(data?.members || []).length})`} />
        <ul className="divide-y divide-line">
          {(data?.members || []).map((m) => {
            const isMe = m.userId === data.me
            const canEdit = can('team.manage') && !isMe && assignableRoles(myRole).includes(m.role)
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-soft text-sm font-bold text-violet">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.name} {isMe && <span className="font-normal text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.email} · joined {formatDate(m.joinedAt, prefs)}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      className="!min-h-10 w-36 !text-sm"
                      onChange={(e) => void act(() => api.patch(`${base}/members/${m.userId}`, { role: e.target.value }), 'Role updated.')}
                    >
                      {assignableRoles(data.myRole).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <button
                      aria-label={`Remove ${m.name}`}
                      onClick={() => confirm(`Remove ${m.name} from ${workspace.name}?`) && void act(() => api.delete(`${base}/members/${m.userId}`), 'Member removed.')}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge tone={m.role === 'owner' ? 'violet' : 'neutral'}>{ROLE_LABELS[m.role]}</Badge>
                    {isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm(`Leave ${workspace.name}?`) && void leave().catch((e) => toast.error(errorMessage(e)))}
                      >
                        Leave
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="mt-6">
        <CardHeader title={`Pending invitations (${(data?.invitations || []).length})`} />
        {(data?.invitations || []).length === 0 ? (
          <EmptyState icon={<MailPlus className="h-5 w-5" />} title="No pending invitations" description="Invitations expire after 7 days." />
        ) : (
          <ul className="divide-y divide-line">
            {(data?.invitations || []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.email}</p>
                  <p className="text-xs text-muted">Expires {formatDate(i.expiresAt, prefs)}</p>
                </div>
                <Badge tone="brand">{ROLE_LABELS[i.role]}</Badge>
                {can('team.manage') && (
                  <button
                    aria-label={`Revoke invitation for ${i.email}`}
                    onClick={() => void act(() => api.delete(`${base}/invitations/${i.id}`), 'Invitation revoked.')}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Roles" />
        <dl className="grid gap-px bg-line sm:grid-cols-2">
          {(['owner', 'admin', 'manager', 'support', 'viewer'] as Role[]).map((r) => (
            <div key={r} className="bg-surface px-5 py-4 sm:px-6">
              <dt className="text-sm font-semibold">{ROLE_LABELS[r]}</dt>
              <dd className="mt-0.5 text-sm text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Modal open={inviteOpen} title="Invite a team member" onClose={closeInvite}>
        {sentTo ? (
          <div className="space-y-4">
            <Alert tone="success">Invitation created for {sentTo}.</Alert>
            <DevMailbox email={sentTo} />
            <Button variant="secondary" className="w-full" onClick={closeInvite}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void invite(e)} className="space-y-4">
            {inviteError && <Alert tone="error">{inviteError}</Alert>}
            <Field label="Email" htmlFor="inv-email">
              <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="inv-role" hint={ROLE_DESCRIPTIONS[role]}>
              <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {invitable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Send invitation
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
