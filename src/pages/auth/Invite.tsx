import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Alert, Badge, Button, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { AuthShell } from './AuthShell'

const KEY = 'starpay.pendingInvite'

interface InviteInfo {
  email: string
  role: Role
  workspaceName: string
}

/** Where an invitation link is waiting after sign-in (the token never goes in a query string). */
export const hasPendingInvite = () => !!sessionStorage.getItem(KEY)

export default function Invite() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const [token] = useState(() => {
    const fromHash = window.location.hash.slice(1)
    if (fromHash) sessionStorage.setItem(KEY, fromHash)
    return fromHash || sessionStorage.getItem(KEY) || ''
  })
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState(token ? '' : 'This invitation link is incomplete.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    history.replaceState(null, '', window.location.pathname)
    api
      .post<InviteInfo>('/invitations/lookup', { token })
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)))
  }, [token])

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ workspaceId: string }>('/invitations/accept', { token })
      sessionStorage.removeItem(KEY)
      await refresh()
      void navigate(`/app/${res.workspaceId}/dashboard`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const mismatch = !!(user && info && user.email.toLowerCase() !== info.email.toLowerCase())

  return (
    <AuthShell title="Workspace invitation">
      {(loading || (!info && !error)) && <Spinner label="Checking invitation" />}
      {error && (
        <div className="space-y-4">
          <Alert tone="error">{error}</Alert>
          <Link to={user ? '/app' : '/signin'} className="inline-block text-sm font-semibold text-brand hover:underline">
            {user ? 'Go to your dashboard' : 'Sign in'}
          </Link>
        </div>
      )}
      {info && !error && !loading && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-surface-muted p-4">
            <p className="text-sm text-muted">You are invited to join</p>
            <p className="display mt-0.5 text-xl font-semibold">{info.workspaceName}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">
              as <Badge tone="brand">{ROLE_LABELS[info.role]}</Badge> for {info.email}
            </div>
          </div>
          {!user && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Sign in or create an account with {info.email} to accept.</p>
              <div className="flex flex-wrap gap-3">
                <Link to="/signin">
                  <Button>Sign in</Button>
                </Link>
                <Link to="/signup">
                  <Button variant="secondary">Create account</Button>
                </Link>
              </div>
            </div>
          )}
          {user && mismatch && (
            <Alert tone="warning">
              You are signed in as {user.email}, but this invitation is for {info.email}. Sign out and sign in with the invited address.
            </Alert>
          )}
          {user && !mismatch && !user.emailVerified && (
            <Alert tone="warning">Verify your email address first. Open the verification link we sent, then return to this invitation.</Alert>
          )}
          {user && !mismatch && user.emailVerified && (
            <Button onClick={() => void accept()} loading={busy} className="w-full">
              Accept invitation
            </Button>
          )}
        </div>
      )}
    </AuthShell>
  )
}
