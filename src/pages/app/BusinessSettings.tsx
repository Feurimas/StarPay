import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { Alert, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES, TIME_ZONES } from '@/lib/countries'

const BUSINESS_TYPES = ['Online store', 'Freelancer', 'Agency', 'Creator', 'Service provider', 'Other']

export default function BusinessSettings() {
  const { workspace: w, can, reload } = useWorkspace()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: w.name,
    legalName: w.legalName ?? '',
    businessType: w.businessType ?? BUSINESS_TYPES[0],
    country: w.country,
    region: w.region ?? '',
    addressLine1: w.addressLine1 ?? '',
    addressLine2: w.addressLine2 ?? '',
    city: w.city ?? '',
    postalCode: w.postalCode ?? '',
    phone: w.phone ?? '',
    website: w.website ?? '',
    supportEmail: w.supportEmail ?? '',
    timezone: w.timezone,
    locale: w.locale,
    dateFormat: w.dateFormat,
    numberFormat: w.numberFormat,
    displayCurrency: w.displayCurrency,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [delError, setDelError] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.patch(`/workspaces/${w.id}`, form)
      await Promise.all([reload(), refresh()])
      toast.success('Business settings saved.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const destroy = async () => {
    setDelBusy(true)
    setDelError('')
    try {
      await api.post(`/workspaces/${w.id}/delete`, { confirmName })
      await refresh()
      void navigate('/app', { replace: true })
    } catch (err) {
      setDelError(errorMessage(err))
    } finally {
      setDelBusy(false)
    }
  }

  const readOnly = !can('workspace.update')

  return (
    <>
      <PageHeader title="Business settings" description="Your business profile, regional formats and organization settings." />
      <form onSubmit={(e) => void save(e)} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Business profile" description="Shown on invoices and receipts in later phases." />
          <fieldset disabled={readOnly || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Display name" htmlFor="name">
              <Input id="name" required minLength={2} value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Registered legal name" htmlFor="legal">
              <Input id="legal" value={form.legalName} onChange={set('legalName')} />
            </Field>
            <Field label="Business type" htmlFor="type">
              <Select id="type" value={form.businessType} onChange={set('businessType')}>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Support email" htmlFor="support">
              <Input id="support" type="email" value={form.supportEmail} onChange={set('supportEmail')} />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="International format, for example +44 20 7946 0958.">
              <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Website" htmlFor="web">
              <Input id="web" type="url" placeholder="https://" value={form.website} onChange={set('website')} />
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Address and jurisdiction" description="Features and payment options can depend on where your business operates." />
          <fieldset disabled={readOnly || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Country" htmlFor="country">
              <Select id="country" value={form.country} onChange={set('country')}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="State, province or region" htmlFor="region">
              <Input id="region" value={form.region} onChange={set('region')} />
            </Field>
            <Field label="Address line 1" htmlFor="a1">
              <Input id="a1" value={form.addressLine1} onChange={set('addressLine1')} />
            </Field>
            <Field label="Address line 2" htmlFor="a2">
              <Input id="a2" value={form.addressLine2} onChange={set('addressLine2')} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" value={form.city} onChange={set('city')} />
            </Field>
            <Field label="Postal code" htmlFor="postal">
              <Input id="postal" value={form.postalCode} onChange={set('postalCode')} />
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Regional formats" description="Controls how dates, times and numbers display for your team." />
          <fieldset disabled={readOnly || busy} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Time zone" htmlFor="tz">
              <Select id="tz" value={form.timezone} onChange={set('timezone')}>
                {(TIME_ZONES.includes(form.timezone) ? TIME_ZONES : [form.timezone, ...TIME_ZONES]).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </Field>
            <Field label="Language" htmlFor="locale" hint="English is available now. More languages are planned.">
              <Select id="locale" value={form.locale} onChange={set('locale')}>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label="Date format" htmlFor="df">
              <Select id="df" value={form.dateFormat} onChange={set('dateFormat')}>
                <option value="auto">Match my browser</option>
                <option value="mdy">MM/DD/YYYY</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="ymd">YYYY-MM-DD</option>
              </Select>
            </Field>
            <Field label="Number format" htmlFor="nf">
              <Select id="nf" value={form.numberFormat} onChange={set('numberFormat')}>
                <option value="auto">Match my browser</option>
                <option value="en-US">1,234.56</option>
                <option value="de-DE">1.234,56</option>
                <option value="fr-FR">1 234,56</option>
                <option value="en-IN">12,34,567.89</option>
              </Select>
            </Field>
            <Field label="Display currency" htmlFor="cur" hint="Payments are always denominated in USDC.">
              <Select id="cur" value={form.displayCurrency} onChange={set('displayCurrency')}>
                <option value="USD">USD</option>
              </Select>
            </Field>
          </fieldset>
        </Card>

        {readOnly ? (
          <Alert tone="info">Only owners and admins can change business settings.</Alert>
        ) : (
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
          </div>
        )}
      </form>

      {can('workspace.delete') && (
        <Card className="mt-8 border-danger/30">
          <CardHeader title="Delete workspace" description="Removes access for every member. This cannot be undone from the app." />
          <div className="p-5 sm:p-6">
            <Button variant="danger" onClick={() => setDelOpen(true)}>
              Delete this workspace
            </Button>
          </div>
        </Card>
      )}
      <Modal open={delOpen} title="Delete workspace" onClose={() => setDelOpen(false)}>
        <div className="space-y-4">
          {delError && <Alert tone="error">{delError}</Alert>}
          <p className="text-sm text-muted text-pretty">
            Type <strong className="text-ink">{w.name}</strong> to confirm.
          </p>
          <Input aria-label="Workspace name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <Button variant="danger" className="w-full" loading={delBusy} disabled={confirmName !== w.name} onClick={() => void destroy()}>
            Delete workspace
          </Button>
        </div>
      </Modal>
    </>
  )
}
