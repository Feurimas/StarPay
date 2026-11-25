import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message)
  }
}

export const badRequest = (m: string) => new HttpError(400, m, 'bad_request')
export const unauthorized = (m = 'Please sign in to continue.') => new HttpError(401, m, 'unauthorized')
export const forbidden = (m = 'You do not have permission to do that.') => new HttpError(403, m, 'forbidden')
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'not_found')
export const conflict = (m: string) => new HttpError(409, m, 'conflict')

export const SESSION_COOKIE = 'sp_session'
export const SESSION_DAYS = 30

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

// ---- Validation helpers (no external schema library) ----
type Body = Record<string, unknown>

export function asBody(value: unknown): Body {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('Request body must be a JSON object.')
  return value as Body
}

export function str(body: Body, key: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const raw = body[key]
  if (raw === undefined || raw === null || raw === '') {
    if (opts.optional) return ''
    throw badRequest(`${key} is required.`)
  }
  if (typeof raw !== 'string') throw badRequest(`${key} must be text.`)
  const value = raw.trim()
  const min = opts.min ?? 1
  const max = opts.max ?? 200
  if (value.length < min) throw badRequest(`${key} must be at least ${min} characters.`)
  if (value.length > max) throw badRequest(`${key} must be at most ${max} characters.`)
  return value
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function email(body: Body, key = 'email'): string {
  const value = str(body, key, { max: 254 }).toLowerCase()
  if (!EMAIL_RE.test(value)) throw badRequest('Enter a valid email address.')
  return value
}

const COMMON_PASSWORDS = new Set([
  '1234567890', '0123456789', '12345678910', '1111111111', '0000000000', 'password12', 'password123', 'password1234', 'passw0rd123',
  'qwertyuiop', 'qwerty12345', 'qwerty123456', 'iloveyou123', 'letmein1234', 'welcome123', 'abcdefghij', 'abcd123456', 'admin12345',
])

/**
 * Length-first policy (no forced letter/number mix, which blocks passphrases and non-Latin scripts and does not
 * make passwords stronger): at least 10 characters, not an obvious password, not the email, not one repeated character.
 */
export function password(body: Body, key = 'password', emailAddress?: string): string {
  const raw = body[key]
  if (typeof raw !== 'string') throw badRequest('Password is required.')
  if ([...raw].length < 10) throw badRequest('Password must be at least 10 characters. A few random words work well.')
  if (raw.length > 200) throw badRequest('Password is too long.')
  const lower = raw.toLowerCase()
  if (COMMON_PASSWORDS.has(lower) || new Set([...raw]).size < 4) throw badRequest('That password is too easy to guess. Choose a longer or less common one.')
  if (emailAddress && (lower === emailAddress.toLowerCase() || lower === emailAddress.split('@')[0]!.toLowerCase())) {
    throw badRequest('Your password cannot be your email address.')
  }
  return raw
}

export function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[]): T {
  const value = str(body, key)
  if (!(allowed as readonly string[]).includes(value)) throw badRequest(`${key} is not valid.`)
  return value as T
}

export function country(body: Body, key = 'country', optional = false): string {
  const value = str(body, key, { min: 2, max: 2, optional }).toUpperCase()
  if (value && !/^[A-Z]{2}$/.test(value)) throw badRequest('Country must be a 2-letter ISO code.')
  return value
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// ---- Rate limiting (in-memory, per process) ----
const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > max) {
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', 'rate_limited')
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (bucket.reset < now) buckets.delete(key)
}, 60_000).unref()

// ---- Cookies ----
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function sessionCookie(req: Request, token: string, maxAgeSeconds: number): string {
  const secure = req.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

/**
 * The address rate limits are keyed on. By default only the socket address is trusted: an X-Forwarded-For header
 * sent by a client is trivially forged and would let an attacker dodge every limit. Set TRUST_PROXY=true only when the
 * API sits behind a proxy you control; the LAST entry is the one that proxy appended, so that is the one used.
 */
export function clientIp(req: Request, socketIp?: string): string {
  if (process.env.TRUST_PROXY === 'true') {
    const parts = req.headers.get('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean)
    const last = parts?.[parts.length - 1]
    if (last) return last
  }
  return socketIp || 'local'
}

/** Per-request context that is not part of a route's arguments (used to bind the development mailbox to one browser). */
export const requestStore = new AsyncLocalStorage<{ devKey: string }>()

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

export function int(body: Body, key: string, opts: { min: number; max: number; optional?: boolean }): number | null {
  const raw = body[key]
  if (raw === undefined || raw === null || raw === '') {
    if (opts.optional) return null
    throw badRequest(`${key} is required.`)
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < opts.min || n > opts.max) throw badRequest(`${key} must be a whole number between ${opts.min} and ${opts.max}.`)
  return n
}

export function bool(body: Body, key: string, fallback = false): boolean {
  const raw = body[key]
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'boolean') throw badRequest(`${key} must be true or false.`)
  return raw
}

/** Error text that is safe to write to logs: RPC provider URLs carry a secret token in the query string. */
export function safeMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  return text.replace(/(_rpc_token|api[_-]?key|token|authorization)=[^&\s"')]+/gi, '$1=[redacted]').replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
}
