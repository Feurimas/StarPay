import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { AiLabel } from '@/components/ai'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useApi } from '@/lib/useApi'

interface Item {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  read: boolean
  aiGenerated: boolean
  createdAt: string
}

export default function Notifications() {
  const { workspace, prefs } = useWorkspace()
  const base = `/workspaces/${workspace.id}/notifications`
  const { data, error, reload } = useApi<{ unread: number; notifications: Item[] }>(base)
  const markAll = async () => {
    try {
      await api.post(`${base}/read`, {})
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const markOne = async (id: string) => {
    await api.post(`${base}/read`, { id }).catch(() => undefined)
    reload()
  }
  return (
    <div>
      <PageHeader title="Notifications" description="Alerts created by your workflows. They appear here only; email delivery needs an email provider." action={data && data.unread > 0 && <Button variant="secondary" onClick={() => void markAll()}>Mark all read</Button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && data.notifications.length === 0 && <EmptyState icon={<Bell className="h-5 w-5" />} title="Nothing yet" description="Enable a workflow and its notifications will show up here." action={<Link to={`/app/${workspace.id}/workflows`} className="text-sm font-medium text-brand underline">Open workflows</Link>} />}
      <div className="space-y-2">
        {data?.notifications.map((n) => (
          <Card key={n.id} className={`p-4 ${n.read ? '' : 'ring-2 ring-brand/30'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-ink">{n.title} {n.aiGenerated && <AiLabel />}</p>
                {n.body && <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>}
                <p className="mt-2 text-xs text-muted">{formatDate(n.createdAt, prefs, true)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {n.link && <Link to={n.link} onClick={() => void markOne(n.id)} className="text-sm font-medium text-brand underline">Open</Link>}
                {!n.read && <button onClick={() => void markOne(n.id)} className="text-xs text-muted underline">Mark read</button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
