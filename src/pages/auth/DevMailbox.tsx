import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'

interface DevMessage {
  id: string
  subject: string
  body: string
  actionPath: string | null
  createdAt: string
}

/**
 * Development-only mailbox. No email provider is connected yet, so messages the app would
 * send (verification, reset, invitations) are shown here instead. It disappears once the
 * server is switched out of development email mode.
 */
export function DevMailbox({ email, refreshKey = 0 }: { email: string; refreshKey?: number }) {
  const [messages, setMessages] = useState<DevMessage[] | null>(null)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ messages: DevMessage[] }>(`/dev/outbox?email=${encodeURIComponent(email)}`)
      .then((r) => !cancelled && setMessages(r.messages))
      .catch(() => !cancelled && setEnabled(false))
    return () => {
      cancelled = true
    }
  }, [email, refreshKey])

  if (!enabled) return null
  return (
    <div className="space-y-3">
      <Alert tone="warning">
        <strong>Development mailbox.</strong> No email provider is connected, so emails for {email} appear here instead of an inbox.
      </Alert>
      {messages === null && <p className="text-sm text-muted">Checking mailbox...</p>}
      {messages?.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
      {messages?.map((m) => (
        <div key={m.id} className="rounded-xl border border-line bg-surface-muted p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-brand" aria-hidden />
            {m.subject}
          </div>
          <p className="mt-1 text-sm text-muted text-pretty">{m.body}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            {m.actionPath ? (
              <Link to={m.actionPath} className="text-sm font-semibold text-brand hover:underline">
                Open link
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-subtle">{relativeTime(m.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
