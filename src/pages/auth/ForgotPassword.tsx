import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Field, Input } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthShell } from './AuthShell'
import { DevMailbox } from './DevMailbox'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send a link to choose a new password."
      footer={
        <Link to="/signin" className="font-semibold text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">If an account exists for {email}, a reset link is on its way. The link expires in one hour.</Alert>
          <DevMailbox email={email} />
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
