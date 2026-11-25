import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PasswordInput } from '@/components/PasswordInput'
import { Alert, Button, Field } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthShell } from './AuthShell'

export default function ResetPassword() {
  // The secret travels in the URL fragment, which is never sent to a server or mirrored.
  const [token] = useState(() => window.location.hash.slice(1))
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/reset-password', { token, password })
      history.replaceState(null, '', window.location.pathname)
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Signing in again will be required on all devices.">
      {!token ? (
        <div className="space-y-4">
          <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>
          <Link to="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password has been changed.</Alert>
          <Link to="/signin" className="inline-block text-sm font-semibold text-brand hover:underline">
            Continue to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" htmlFor="password" hint="At least 10 characters. Any characters are fine, and a few random words make a strong password.">
            <PasswordInput id="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Change password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
