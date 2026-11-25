import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AiLabel } from '@/components/ai'
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/useApi'

/** Contact form on a public storefront. Starts a conversation that lands in the business's inbox. */
export function SupportForm() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ publicId: string }>(`/public/stores/${slug}/support`, form)
      void navigate(`/support/${r.publicId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="display text-2xl font-semibold text-ink">Contact the store</h1>
      <p className="mt-1 text-sm text-muted">Ask about a product or an order. Never share passwords, seed phrases or private keys with anyone.</p>
      <Card className="mt-5 p-5">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="sn"><Input id="sn" required minLength={2} maxLength={100} value={form.name} onChange={set('name')} autoComplete="name" /></Field>
            <Field label="Email" htmlFor="se" hint="Used to match your orders."><Input id="se" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></Field>
          </div>
          <Field label="Subject" htmlFor="ss"><Input id="ss" required minLength={3} maxLength={120} value={form.subject} onChange={set('subject')} /></Field>
          <Field label="Message" htmlFor="sm"><Textarea id="sm" required minLength={3} maxLength={4000} rows={5} value={form.message} onChange={set('message')} /></Field>
          <Button type="submit" loading={busy} className="w-full">Send message</Button>
        </form>
      </Card>
    </div>
  )
}

interface Thread {
  subject: string
  status: string
  store: { slug: string; title: string }
  messages: { sender: 'customer' | 'agent' | 'ai'; body: string; aiGenerated: boolean; createdAt: string }[]
}

/** The customer's view of a conversation, reachable by an unguessable id. Internal notes are never included. */
export function SupportThread() {
  const { pid } = useParams()
  const { data, error, reload } = useApi<Thread>(`/public/support/${pid}`)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    const id = window.setInterval(reload, 15000)
    return () => window.clearInterval(id)
  }, [reload])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setSendError('')
    try {
      await api.post(`/public/support/${pid}/messages`, { message: text.trim() })
      setText('')
      reload()
    } catch (err) {
      setSendError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="mx-auto max-w-lg p-6"><Alert tone="error">{error}</Alert></div>
  if (!data) return <Spinner />
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to={`/s/${data.store.slug}`} className="text-sm text-muted hover:text-ink">← {data.store.title}</Link>
      <h1 className="display mt-2 text-2xl font-semibold text-ink">{data.subject}</h1>
      <p className="text-sm text-muted">Bookmark this page to follow the conversation. Anyone with the link can read it.</p>
      <Card className="mt-4 space-y-3 p-4">
        {data.messages.map((m, i) => (
          <div key={i} className={m.sender === 'customer' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.sender === 'customer' ? 'bg-ink text-white' : m.sender === 'ai' ? 'bg-violet-50 text-ink ring-1 ring-violet-200' : 'bg-canvas text-ink'}`}>
              <p className="mb-0.5 flex items-center gap-2 text-[11px] opacity-70">{m.sender === 'customer' ? 'You' : m.sender === 'ai' ? <AiLabel /> : 'The store team'} · {new Date(m.createdAt).toLocaleString()}</p>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          </div>
        ))}
        {data.messages.some((m) => m.sender === 'ai') && <p className="text-xs text-muted">Replies marked AI-generated are written by an automated assistant and may be wrong. A team member can follow up. The assistant cannot see or change orders and payments.</p>}
      </Card>
      <form onSubmit={(e) => void send(e)} className="mt-4 space-y-2">
        {sendError && <Alert tone="error">{sendError}</Alert>}
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" maxLength={4000} aria-label="Your reply" />
        <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!text.trim()}>Send</Button></div>
      </form>
    </div>
  )
}
