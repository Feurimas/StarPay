import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { PasswordInput } from '@/components/PasswordInput'
import { Alert, Button, Field, Input } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthShell } from './AuthShell'

export default function SignIn() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/signin', { email, password })
      await refresh()
      void navigate('/app', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your StarPay workspace."
      footer={
        <>
          New to StarPay?{' '}
          <Link to="/signup" className="font-semibold text-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        {error && (
          <Alert tone="error">
            {error}
            {error.startsWith('Incorrect') && (
              <span className="mt-1 block">
                No account yet? <Link to="/signup" className="font-semibold underline">Create one</Link>. Forgot it? <Link to="/forgot-password" className="font-semibold underline">Reset your password</Link>.
              </span>
            )}
          </Alert>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
