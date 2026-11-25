import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'
import { type RegionalPrefs } from '@/lib/format'
import { can, type Permission, type Role } from '@/lib/permissions'

export interface Workspace {
  id: string
  name: string
  slug: string
  legalName: string | null
  businessType: string | null
  country: string
  region: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  postalCode: string | null
  phone: string | null
  website: string | null
  supportEmail: string | null
  timezone: string
  locale: string
  dateFormat: string
  numberFormat: string
  displayCurrency: string
}

interface WorkspaceState {
  workspace: Workspace
  role: Role
  prefs: RegionalPrefs
  can: (permission: Permission) => boolean
  reload: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({
  workspaceId,
  children,
  fallback,
  notFound,
}: {
  workspaceId: string
  children: ReactNode
  fallback: ReactNode
  notFound: ReactNode
}) {
  const [data, setData] = useState<{ workspace: Workspace; role: Role } | null>(null)
  const [missing, setMissing] = useState(false)

  const reload = useCallback(async () => {
    try {
      setData(await api.get<{ workspace: Workspace; role: Role }>(`/workspaces/${workspaceId}`))
      setMissing(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true)
    }
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ workspace: Workspace; role: Role }>(`/workspaces/${workspaceId}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && e instanceof ApiError && e.status === 404 && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const value = useMemo<WorkspaceState | null>(() => {
    if (!data) return null
    return {
      workspace: data.workspace,
      role: data.role,
      prefs: { timezone: data.workspace.timezone, dateFormat: data.workspace.dateFormat, numberFormat: data.workspace.numberFormat },
      can: (p) => can(data.role, p),
      reload,
    }
  }, [data, reload])

  if (missing) return <>{notFound}</>
  if (!value) return <>{fallback}</>
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
