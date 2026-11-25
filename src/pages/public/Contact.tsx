import { useState, type FormEvent } from 'react'
import { PublicHero } from '@/components/PublicHero'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', topic: 'sales', message: '' })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/contact', form)
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PublicHero eyebrow="Contact" title="Talk to the team." lead="Questions about StarPay, partnerships or support. Your message is saved for the team to review." />
      <div className="mx-auto max-w-xl">
      {sent ? (
        <Alert tone="success">Thanks, your message was received. Replies are not automated yet, so please allow some time.</Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Name" htmlFor="c-name">
            <Input id="c-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input id="c-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Topic" htmlFor="c-topic">
            <Select id="c-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="partnership">Partnership</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Message" htmlFor="c-msg" hint="Please do not include passwords, private keys or seed phrases.">
            <Textarea id="c-msg" required minLength={10} maxLength={4000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Send message
          </Button>
        </form>
      )}
      </div>
    </div>
  )
}
