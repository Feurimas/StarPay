import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { PasswordInput } from '@/components/PasswordInput'
import { Alert, Button, Field, Input } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { AuthShell } from './AuthShell'

export default function SignUp() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/signup', { name, email, password })
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
      title="Create your account"
      subtitle="Set up StarPay for your business in a few minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold text-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name" htmlFor="name">
          <Input id="name" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters. Any characters are fine, and a few random words make a strong password.">
          <PasswordInput id="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className={`mt-1 text-xs ${[...password].length >= 10 ? 'text-success' : 'text-muted'}`} aria-live="polite">{[...password].length >= 10 ? 'Long enough.' : `${[...password].length} of 10 characters`}</p>
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 rounded border-line accent-[#0b1b3a]" />
          <span className="text-pretty">
            I understand StarPay is software, not a bank, exchange or regulated financial institution, and I am responsible for following the laws that apply to my business.
          </span>
        </label>
        <Button type="submit" loading={busy} disabled={!accepted} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
