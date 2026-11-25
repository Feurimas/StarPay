import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Spinner } from '@/components/ui'
import { hasPendingInvite } from '@/pages/auth/Invite'

/** /app: send the user to the right place after sign-in. */
export default function AppHome() {
  const { user, workspaces, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/signin" replace />
  if (hasPendingInvite()) return <Navigate to="/invite" replace />
  if (workspaces.length === 0) return <Navigate to="/app/new" replace />
  return <Navigate to={`/app/${workspaces[0].id}/dashboard`} replace />
}
