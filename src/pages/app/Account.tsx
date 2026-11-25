import { Download } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { PasswordInput } from '@/components/PasswordInput'
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { COUNTRIES, TIME_ZONES } from '@/lib/countries'

export default function Account() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    country: user?.country ?? '',
    timezone: user?.timezone ?? 'UTC',
    locale: user?.locale ?? 'en',
  })
  const [profileError, setProfileError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' })
  const [pwError, setPwError] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delPw, setDelPw] = useState('')
  const [delError, setDelError] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  if (!user) return null

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileBusy(true)
    setProfileError('')
    try {
      await api.patch('/account', profile)
      await refresh()
      toast.success('Profile saved.')
    } catch (err) {
      setProfileError(errorMessage(err))
    } finally {
      setProfileBusy(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwBusy(true)
    setPwError('')
    try {
      await api.post('/account/password', pw)
      setPw({ currentPassword: '', newPassword: '' })
      toast.success('Password changed. Other devices were signed out.')
    } catch (err) {
      setPwError(errorMessage(err))
    } finally {
      setPwBusy(false)
    }
  }

  const exportData = async () => {
    try {
      const data = await api.get<unknown>('/account/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'starpay-account-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deleteAccount = async () => {
    setDelBusy(true)
    setDelError('')
    try {
      await api.post('/account/delete', { password: delPw })
      await refresh()
      void navigate('/', { replace: true })
    } catch (err) {
      setDelError(errorMessage(err))
    } finally {
      setDelBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Account" description="Your personal profile, security and privacy." />
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Profile"
            action={user.emailVerified ? <Badge tone="success">Email verified</Badge> : <Badge tone="warning">Email not verified</Badge>}
          />
          <form onSubmit={(e) => void saveProfile(e)} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {profileError && (
              <div className="sm:col-span-2">
                <Alert tone="error">{profileError}</Alert>
              </div>
            )}
            <Field label="Full name" htmlFor="p-name">
              <Input id="p-name" required minLength={2} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="p-email">
              <Input id="p-email" value={user.email} disabled readOnly />
            </Field>
            <Field label="Phone" htmlFor="p-phone" hint="International format, for example +1 415 555 0100.">
              <Input id="p-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </Field>
            <Field label="Country" htmlFor="p-country">
              <Select id="p-country" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })}>
                <option value="">Not set</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Time zone" htmlFor="p-tz">
              <Select id="p-tz" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
                {(TIME_ZONES.includes(profile.timezone) ? TIME_ZONES : [profile.timezone, ...TIME_ZONES]).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </Field>
            <Field label="Language" htmlFor="p-locale">
              <Select id="p-locale" value={profile.locale} onChange={(e) => setProfile({ ...profile, locale: e.target.value })}>
                <option value="en">English</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={profileBusy}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Password" description="Changing your password signs out every other device." />
          <form onSubmit={(e) => void changePassword(e)} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {pwError && (
              <div className="sm:col-span-2">
                <Alert tone="error">{pwError}</Alert>
              </div>
            )}
            <Field label="Current password" htmlFor="cur-pw">
              <Input id="cur-pw" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="new-pw" hint="At least 10 characters. Any characters are fine, and a few random words make a strong password.">
              <PasswordInput id="new-pw" autoComplete="new-password" required minLength={10} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" loading={pwBusy}>
                Change password
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Privacy" description="You control your data. StarPay never stores wallet keys or seed phrases." />
          <div className="flex flex-wrap gap-3 p-5 sm:p-6">
            <Button variant="secondary" onClick={() => void exportData()}>
              <Download className="h-4 w-4" aria-hidden /> Download my data
            </Button>
            <Button variant="danger" onClick={() => setDelOpen(true)}>
              Delete my account
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={delOpen} title="Delete your account" onClose={() => setDelOpen(false)}>
        <div className="space-y-4">
          {delError && <Alert tone="error">{delError}</Alert>}
          <p className="text-sm text-muted text-pretty">
            Your profile is erased and you are removed from every workspace. Workspaces where you are the only member are deleted. If others depend on you as owner, transfer ownership first.
          </p>
          <Field label="Confirm your password" htmlFor="del-pw">
            <Input id="del-pw" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          </Field>
          <Button variant="danger" className="w-full" loading={delBusy} disabled={!delPw} onClick={() => void deleteAccount()}>
            Permanently delete account
          </Button>
        </div>
      </Modal>
    </>
  )
}
