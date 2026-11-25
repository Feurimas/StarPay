import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import type { Role } from '@/lib/permissions'

export interface User {
  id: string
  email: string
  name: string
  emailVerified: boolean
  phone: string | null
  country: string | null
  locale: string
  timezone: string
}

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  role: Role
  country: string
}

interface AuthState {
  loading: boolean
  user: User | null
  workspaces: WorkspaceSummary[]
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User | null; workspaces: WorkspaceSummary[] }>('/auth/me')
      setUser(data.user)
      setWorkspaces(data.workspaces)
    } catch {
      setUser(null)
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ user: User | null; workspaces: WorkspaceSummary[] }>('/auth/me')
      .then((d) => {
        if (cancelled) return
        setUser(d.user)
        setWorkspaces(d.workspaces)
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    await api.post('/auth/signout')
    setUser(null)
    setWorkspaces([])
  }, [])

  const value = useMemo(() => ({ loading, user, workspaces, refresh, signOut }), [loading, user, workspaces, refresh, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
