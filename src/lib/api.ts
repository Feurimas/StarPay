import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message)
  }
}

// Fallback handlers powered directly by Supabase when backend server is unavailable
async function supabaseFallback<T>(method: string, path: string, body?: any): Promise<T> {
      // 1. Auth SignUp
    if (path === '/auth/signup' && method === 'POST') {
      const { name, email, password } = body || {}
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })

      if (authError) {
        if (authError.message.toLowerCase().includes('rate limit')) {
          throw new ApiError(429, 'Confirmation email already sent or rate limited. Please check your inbox (or spam) to confirm your email, or turn off "Confirm email" in your Supabase dashboard.', 'rate_limit')
        }
        if (authError.message.toLowerCase().includes('already registered')) {
          throw new ApiError(400, 'An account with this email already exists. Please go to Sign in.', 'already_registered')
        }
        throw new ApiError(400, authError.message, 'auth_error')
      }

      const user = authData.user
      if (user) {
        await supabase.from('users').upsert({
          id: user.id,
          email: user.email,
          name: name || user.email?.split('@')[0] || 'User',
          password_hash: 'managed_by_supabase_auth',
          email_verified_at: user.email_confirmed_at || new Date().toISOString(),
        }).select()
      }
      return { ok: true, user } as T
    }

  // 2. Auth SignIn
  if (path === '/auth/signin' && method === 'POST') {
    const { email, password } = body || {}
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new ApiError(401, error.message, 'auth_error')
    return { ok: true, user: data.user } as T
  }

  // 3. Auth SignOut
  if (path === '/auth/signout') {
    await supabase.auth.signOut()
    return { ok: true } as T
  }

  // 4. Current User & Workspaces (/auth/me)
  if (path === '/auth/me') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { user: null, workspaces: [] } as T

    const u = session.user
    // Fetch user profile
    const { data: profile } = await supabase.from('users').select('*').eq('id', u.id).single()

    // Fetch workspaces where user has membership
    const { data: memberships } = await supabase
      .from('memberships')
      .select('role, workspace_id, workspaces(id, name, slug, country)')
      .eq('user_id', u.id)

    const workspaces = (memberships || [])
      .filter((m: any) => m.workspaces)
      .map((m: any) => ({
        id: m.workspaces.id,
        name: m.workspaces.name,
        slug: m.workspaces.slug,
        role: m.role,
        country: m.workspaces.country,
      }))

    const userData = {
      id: u.id,
      email: u.email || '',
      name: profile?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'User',
      emailVerified: Boolean(u.email_confirmed_at),
      phone: profile?.phone || null,
      country: profile?.country || null,
      locale: profile?.locale || 'en',
      timezone: profile?.timezone || 'UTC',
    }

    return { user: userData, workspaces } as T
  }

  // 5. Create Workspace (/workspaces)
  if (path === '/workspaces' && method === 'POST') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new ApiError(401, 'Please sign in to create a workspace', 'unauthorized')

    const { name, country, businessType } = body || {}
    const slug = (name || 'workspace')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6)

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({
        name,
        slug,
        country: country || 'US',
        business_type: businessType || 'Online store',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (wsErr) throw new ApiError(400, wsErr.message, 'db_error')

    // Add membership as owner
    await supabase.from('memberships').insert({
      workspace_id: ws.id,
      user_id: session.user.id,
      role: 'owner',
    })

    return { id: ws.id } as T
  }

  // 6. Get Workspace by ID (/workspaces/:id)
  const wsMatch = path.match(/^\/workspaces\/([a-zA-Z0-9-]+)$/)
  if (wsMatch && method === 'GET') {
    const wsId = wsMatch[1]
    const { data: ws, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', wsId)
      .single()

    if (error || !ws) throw new ApiError(404, 'Workspace not found', 'not_found')

    const { data: { session } } = await supabase.auth.getSession()
    let role = 'owner'
    if (session?.user) {
      const { data: mem } = await supabase
        .from('memberships')
        .select('role')
        .eq('workspace_id', wsId)
        .eq('user_id', session.user.id)
        .single()
      if (mem?.role) role = mem.role
    }

    return { workspace: ws, role } as T
  }

  // 7. Restricted Countries meta
  if (path === '/meta/restricted-countries') {
    const { data } = await supabase.from('restricted_countries').select('code')
    return { restricted: (data || []).map((r: any) => r.code) } as T
  }

  // 8. Forgot Password
  if (path === '/auth/forgot-password' && method === 'POST') {
    const { email } = body || {}
    await supabase.auth.resetPasswordForEmail(email)
    return { ok: true } as T
  }

  // Generic fallback: query table directly if path matches a resource
  throw new ApiError(404, 'Resource not found', 'not_found')
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (raw) headers['Content-Type'] = raw.type || 'application/octet-stream'
  if (method !== 'GET') headers['X-Requested-With'] = 'fetch'

  let res: Response | null = null
  let data: any = null

  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
    data = await res.json().catch(() => null)
  } catch {
    // Network or routing error -> fall back to Supabase
    return supabaseFallback<T>(method, path, body)
  }

  // If server returns HTML, 404, or 405 (no server function route), use Supabase directly!
  if (data === null || res.status === 404 || res.status === 405) {
    return supabaseFallback<T>(method, path, body)
  }

  if (!res.ok) {
    if (data === null && res.status >= 500) {
      return supabaseFallback<T>(method, path, body)
    }
    const err = (data as { error?: { message?: string; code?: string } } | null)?.error
    throw new ApiError(res.status, err?.message ?? 'Something went wrong. Please try again.', err?.code ?? 'error')
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  upload: <T>(path: string, blob: Blob) => request<T>('POST', path, undefined, blob),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.')