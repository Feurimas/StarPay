import { waitUntil } from '@vercel/functions'
import { timingSafeEqual } from 'node:crypto'
import { migrate } from '../server/db'
import { handle } from '../server/index'
import { sweepPayments } from '../server/payments'
import { runDueSchedules } from '../server/workflowEngine'

/**
 * Vercel entry point. Every /api/* request lands here and is handed to the same fetch handler the local API server
 * uses (the local dev proxy strips the /api prefix, so this does too).
 */
let ready: Promise<void> | null = null
const ensureReady = () => (ready ??= migrate().catch((e) => {
  ready = null
  throw e
}))

let lastSweep = 0

function authorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function cron(request: Request): Promise<Response> {
  if (!authorizedCron(request)) return Response.json({ error: { message: 'Not found.', code: 'not_found' } }, { status: 404 })
  await ensureReady()
  const schedules = await runDueSchedules()
  await sweepPayments()
  return Response.json({ ok: true, schedulesRun: schedules })
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/'
    if (path === '/cron') return cron(request)

    await ensureReady()
    const res = await handle(new Request(`${url.origin}${path}${url.search}`, request), request.headers.get('x-real-ip') ?? undefined)

    // Serverless instances have no background timer, so unfinished payments are re-checked opportunistically.
    if (Date.now() - lastSweep > 30_000) {
      lastSweep = Date.now()
      waitUntil(sweepPayments().catch(() => undefined))
    }
    return res
  },
}
