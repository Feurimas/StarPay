import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Alert, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthShell } from './AuthShell'

export default function VerifyEmail() {
  const { refresh, user } = useAuth()
  const [token] = useState(() => window.location.hash.slice(1))
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error')
  const [message, setMessage] = useState(token ? '' : 'This verification link is incomplete. Request a new one from your dashboard.')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    api
      .post('/auth/verify-email', { token })
      .then(async () => {
        history.replaceState(null, '', window.location.pathname)
        await refresh()
        setState('done')
      })
      .catch((e) => {
        setMessage(errorMessage(e))
        setState('error')
      })
  }, [token, refresh])

  return (
    <AuthShell title="Email verification">
      {state === 'working' && <Spinner label="Verifying your email" />}
      {state === 'done' && (
        <div className="space-y-4">
          <Alert tone="success">Your email address is verified.</Alert>
          <Link to={user ? '/app' : '/signin'} className="inline-block text-sm font-semibold text-brand hover:underline">
            Continue to StarPay
          </Link>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-4">
          <Alert tone="error">{message}</Alert>
          <Link to={user ? '/app' : '/signin'} className="inline-block text-sm font-semibold text-brand hover:underline">
            {user ? 'Go to your dashboard' : 'Sign in'}
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
