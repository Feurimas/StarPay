import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Logo } from '@/components/Logo'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'

const BUSINESS_TYPES = ['Online store', 'Freelancer', 'Agency', 'Creator', 'Service provider', 'Other']

export default function NewWorkspace() {
  const { user, workspaces, refresh } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [country, setCountry] = useState(user?.country ?? '')
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0])
  const [restricted, setRestricted] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<{ restricted: string[] }>('/meta/restricted-countries').then((r) => setRestricted(r.restricted)).catch(() => undefined)
  }, [])

  const blocked = restricted.includes(country)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ id: string }>('/workspaces', { name, country, businessType })
      await refresh()
      void navigate(`/app/${res.id}/dashboard`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          {workspaces.length > 0 && (
            <Link to="/app" className="text-sm font-medium text-muted hover:text-ink">
              Cancel
            </Link>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="display text-[1.75rem] font-semibold leading-tight">Create your business workspace</h1>
          <p className="mt-1.5 text-[15px] text-muted text-pretty">
            Each workspace keeps its customers, orders and payments private to the people you invite.
          </p>
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Business name" htmlFor="name">
              <Input id="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" />
            </Field>
            <Field label="Business type" htmlFor="type">
              <Select id="type" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country of operation" htmlFor="country" hint="Used for jurisdiction eligibility. Not every feature is available in every country.">
              <Select id="country" required value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="" disabled>
                  Select a country
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {blocked && <Alert tone="error">StarPay is not available for businesses in this jurisdiction.</Alert>}
            <Button type="submit" loading={busy} disabled={blocked || !country} className="w-full">
              Create workspace
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
