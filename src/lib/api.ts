export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (raw) headers['Content-Type'] = raw.type || 'application/octet-stream'
  // The API requires this header on writes as a cross-site request defence.
  if (method !== 'GET') headers['X-Requested-With'] = 'fetch'
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach StarPay right now. Check your connection and try again.', 'network')
  }
  const data: unknown = await res.json().catch(() => null)
  // The API always answers with JSON. No JSON at all means no StarPay server is behind this address (for example a
  // static-only deployment) or it is down.
  if (data === null) {
    if (res.status === 404 || res.status === 405 || (res.ok && method !== 'DELETE')) {
      throw new ApiError(res.status, 'The StarPay server is not connected to this site yet, so this action is not available.', 'no_backend')
    }
  }
  if (!res.ok) {
    if (data === null && res.status >= 500) {
      throw new ApiError(res.status, 'The StarPay server is starting or unavailable. Wait a few seconds and try again.', 'unavailable')
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
