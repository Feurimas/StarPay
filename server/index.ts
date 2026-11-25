import * as assistant from './assistant'
import * as auth from './auth'
import * as commerce from './commerce'
import { loadUser, type Ctx } from './context'
import { migrate } from './db'
import { EMAIL_MODE } from './mail'
import { clientIp, HttpError, newToken, readCookie, requestStore, securityHeaders, safeMessage } from './http'
import * as knowledge from './knowledge'
import * as misc from './misc'
import * as orders from './orders'
import * as insights from './insights'
import * as payments from './payments'
import * as pub from './public'
import * as support from './support'
import * as workflows from './workflows'
import { runDueSchedules } from './workflowEngine'
import * as ws from './workspaces'

type Handler = (ctx: Ctx) => Promise<unknown> | unknown
interface Route {
  method: string
  re: RegExp
  handler: Handler
}

export const routes: Route[] = []
const add = (method: string, path: string, handler: Handler) => {
  routes.push({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler })
}

add('GET', '/health', misc.health)
add('GET', '/meta/restricted-countries', misc.restrictedCountries)
add('POST', '/contact', misc.contact)
add('GET', '/dev/outbox', misc.devOutbox)

add('POST', '/auth/signup', auth.signup)
add('POST', '/auth/signin', auth.signin)
add('POST', '/auth/signout', auth.signout)
add('GET', '/auth/me', auth.me)
add('POST', '/auth/verify-email', auth.verifyEmail)
add('POST', '/auth/resend-verification', auth.resendVerification)
add('POST', '/auth/forgot-password', auth.forgotPassword)
add('POST', '/auth/reset-password', auth.resetPassword)

add('PATCH', '/account', auth.updateProfile)
add('POST', '/account/password', auth.changePassword)
add('GET', '/account/export', auth.exportAccount)
add('POST', '/account/delete', auth.deleteAccount)

add('POST', '/invitations/lookup', ws.lookupInvitation)
add('POST', '/invitations/accept', ws.acceptInvitation)

add('POST', '/workspaces', ws.createWorkspace)
add('GET', '/workspaces/:wid', ws.getWorkspace)
add('PATCH', '/workspaces/:wid', ws.updateWorkspace)
add('POST', '/workspaces/:wid/delete', ws.deleteWorkspace)
add('GET', '/workspaces/:wid/dashboard', ws.dashboard)
add('GET', '/workspaces/:wid/members', ws.listMembers)
add('PATCH', '/workspaces/:wid/members/:uid', ws.changeRole)
add('DELETE', '/workspaces/:wid/members/:uid', ws.removeMember)
add('POST', '/workspaces/:wid/invitations', ws.inviteMember)
add('DELETE', '/workspaces/:wid/invitations/:iid', ws.revokeInvitation)
add('GET', '/workspaces/:wid/audit', ws.listAudit)

// Commerce (workspace-scoped; every handler goes through requireMember)
add('GET', '/workspaces/:wid/categories', commerce.listCategories)
add('POST', '/workspaces/:wid/categories', commerce.createCategory)
add('DELETE', '/workspaces/:wid/categories/:cid', commerce.deleteCategory)
add('GET', '/workspaces/:wid/products', commerce.listProducts)
add('POST', '/workspaces/:wid/products', commerce.createProduct)
add('GET', '/workspaces/:wid/products/:pid', commerce.getProduct)
add('PUT', '/workspaces/:wid/products/:pid', commerce.updateProduct)
add('DELETE', '/workspaces/:wid/products/:pid', commerce.archiveProduct)
add('POST', '/workspaces/:wid/products/:pid/images', commerce.uploadImage)
add('DELETE', '/workspaces/:wid/images/:iid', commerce.deleteImage)
add('GET', '/workspaces/:wid/storefront', commerce.getStorefront)
add('PUT', '/workspaces/:wid/storefront', commerce.updateStorefront)
add('GET', '/workspaces/:wid/discounts', commerce.listDiscounts)
add('POST', '/workspaces/:wid/discounts', commerce.createDiscount)
add('PATCH', '/workspaces/:wid/discounts/:did', commerce.setDiscountActive)
add('DELETE', '/workspaces/:wid/discounts/:did', commerce.deleteDiscount)
add('GET', '/workspaces/:wid/orders', orders.listOrders)
add('POST', '/workspaces/:wid/orders', orders.createManualOrder)
add('GET', '/workspaces/:wid/orders/:oid', orders.getOrder)
add('PATCH', '/workspaces/:wid/orders/:oid/status', orders.updateOrderStatus)
add('PATCH', '/workspaces/:wid/orders/:oid/notes', orders.updateOrderNotes)
add('POST', '/workspaces/:wid/orders/:oid/invoice', orders.createInvoice)
add('GET', '/workspaces/:wid/customers', orders.listCustomers)
add('POST', '/workspaces/:wid/customers', orders.createCustomer)
add('GET', '/workspaces/:wid/customers/:cid', orders.getCustomer)
add('PUT', '/workspaces/:wid/customers/:cid', orders.updateCustomer)
add('DELETE', '/workspaces/:wid/customers/:cid', orders.deleteCustomer)
add('GET', '/workspaces/:wid/invoices', orders.listInvoices)
add('GET', '/workspaces/:wid/invoices/:vid', orders.getInvoice)
add('GET', '/workspaces/:wid/sales', orders.salesSummary)
add('GET', '/workspaces/:wid/insights', insights.insights)
add('GET', '/workspaces/:wid/reports/:kind', insights.exportCsv)

// Public storefront (no sign-in; reads only published stores and opaque order/invoice ids)
add('GET', '/images/:iid', commerce.serveImage)
add('GET', '/public/stores/:slug', pub.getStore)
add('GET', '/public/stores/:slug/products/:pid', pub.getStoreProduct)
add('POST', '/public/stores/:slug/quote', pub.quote)
add('POST', '/public/stores/:slug/orders', pub.checkout)
add('GET', '/public/orders/:oid', pub.getPublicOrder)
add('GET', '/public/invoices/:pubid', orders.getPublicInvoice)

// Arc USDC payments
add('GET', '/public/payment-config', payments.paymentConfig)
add('POST', '/public/orders/:oid/payment', payments.requestPayment)
add('POST', '/public/orders/:oid/payment/submit', payments.submitPayment)
add('POST', '/public/orders/:oid/payment/refresh', payments.refreshPublicPayment)
add('GET', '/workspaces/:wid/payments', payments.listPayments)
add('POST', '/workspaces/:wid/payments/:pid/refresh', payments.merchantRefreshPayment)
add('GET', '/workspaces/:wid/orders/:oid/payment', payments.merchantOrderPayment)
add('POST', '/workspaces/:wid/orders/:oid/payment-request', payments.merchantRequestPayment)
add('GET', '/workspaces/:wid/payout', payments.getPayout)
add('PUT', '/workspaces/:wid/payout', payments.setPayout)

// AI assistant, knowledge base, support inbox, workflows, notifications
add('GET', '/workspaces/:wid/assistant/settings', assistant.getSettings)
add('PUT', '/workspaces/:wid/assistant/settings', assistant.saveSettings)
add('POST', '/workspaces/:wid/assistant/chat', assistant.chatWithAssistant)
add('GET', '/workspaces/:wid/assistant/conversations', assistant.listAiConversations)
add('GET', '/workspaces/:wid/assistant/conversations/:aid', assistant.getAiConversation)
add('DELETE', '/workspaces/:wid/assistant/conversations/:aid', assistant.deleteAiConversation)
add('POST', '/workspaces/:wid/assistant/describe', assistant.describeProduct)
add('POST', '/workspaces/:wid/assistant/report', assistant.businessReport)
add('GET', '/workspaces/:wid/knowledge', knowledge.listDocs)
add('POST', '/workspaces/:wid/knowledge', knowledge.createDoc)
add('PUT', '/workspaces/:wid/knowledge/:kid', knowledge.updateDoc)
add('DELETE', '/workspaces/:wid/knowledge/:kid', knowledge.deleteDoc)
add('GET', '/workspaces/:wid/support', support.listConversations)
add('GET', '/workspaces/:wid/support/:cid', support.getConversation)
add('POST', '/workspaces/:wid/support/:cid/reply', support.reply)
add('POST', '/workspaces/:wid/support/:cid/notes', support.addNote)
add('PATCH', '/workspaces/:wid/support/:cid', support.updateConversation)
add('POST', '/workspaces/:wid/support/:cid/ai-draft', support.aiDraft)
add('GET', '/workspaces/:wid/workflow-meta', workflows.meta)
add('GET', '/workspaces/:wid/workflows', workflows.listWorkflows)
add('POST', '/workspaces/:wid/workflows', workflows.createWorkflow)
add('GET', '/workspaces/:wid/workflows/:fid', workflows.getWorkflow)
add('PUT', '/workspaces/:wid/workflows/:fid', workflows.updateWorkflow)
add('POST', '/workspaces/:wid/workflows/:fid/enabled', workflows.setEnabled)
add('POST', '/workspaces/:wid/workflows/:fid/run', workflows.runNow)
add('DELETE', '/workspaces/:wid/workflows/:fid', workflows.deleteWorkflow)
add('GET', '/workspaces/:wid/notifications', workflows.listNotifications)
add('POST', '/workspaces/:wid/notifications/read', workflows.markRead)
add('POST', '/public/stores/:slug/support', support.startPublicConversation)
add('GET', '/public/support/:pid', support.getPublicConversation)
add('POST', '/public/support/:pid/messages', support.postPublicMessage)

const MAX_BODY_BYTES = 100_000
const MAX_IMAGE_REQUEST_BYTES = 2_000_000

function respond(result: unknown): Response {
  if (result instanceof Response) {
    for (const [k, v] of Object.entries(securityHeaders)) if (!result.headers.has(k)) result.headers.set(k, v)
    return result
  }
  return Response.json(result ?? { ok: true }, { headers: securityHeaders })
}

const DEV_COOKIE = 'sp_dev'

/** Entry point. In development email mode, each browser gets a private key so it can only read mail its own actions created. */
export async function handle(req: Request, socketIp?: string): Promise<Response> {
  const existing = readCookie(req, DEV_COOKIE)
  const devKey = existing ?? newToken()
  const res = await requestStore.run({ devKey }, () => dispatch(req, socketIp))
  if (EMAIL_MODE === 'dev' && !existing) {
    res.headers.append('Set-Cookie', `${DEV_COOKIE}=${encodeURIComponent(devKey)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`)
  }
  return res
}

async function dispatch(req: Request, socketIp?: string): Promise<Response> {
  try {
    const url = new URL(req.url)
    const method = req.method.toUpperCase()

    // CSRF defence in depth on top of SameSite=Lax: state-changing calls must carry this header,
    // which a cross-site form or image cannot set.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && req.headers.get('x-requested-with') !== 'fetch') {
      throw new HttpError(403, 'Missing request header.', 'csrf')
    }
    const length = Number(req.headers.get('content-length') ?? 0)
    const isImageUpload = method === 'POST' && /\/products\/[^/]+\/images$/.test(url.pathname)
    if (length > (isImageUpload ? MAX_IMAGE_REQUEST_BYTES : MAX_BODY_BYTES)) throw new HttpError(413, 'Request is too large.', 'too_large')

    for (const route of routes) {
      if (route.method !== method) continue
      const match = route.re.exec(url.pathname)
      if (!match) continue
      const ctx: Ctx = {
        req,
        url,
        params: { ...(match.groups ?? {}) },
        ip: clientIp(req, socketIp),
        body: async () => {
          try {
            return await req.json()
          } catch {
            throw new HttpError(400, 'Request body must be valid JSON.', 'bad_request')
          }
        },
        user: await loadUser(req),
      }
      return respond(await route.handler(ctx))
    }
    throw new HttpError(404, 'Not found.', 'not_found')
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status, headers: securityHeaders })
    }
    console.error('Unhandled API error:', safeMessage(error))
    return Response.json(
      { error: { message: 'Something went wrong on our side. Please try again.', code: 'internal' } },
      { status: 500, headers: securityHeaders },
    )
  }
}

if (import.meta.main) {
  await migrate()
  const port = Number(process.env.API_PORT ?? 3001)
  Bun.serve({ port, hostname: '127.0.0.1', fetch: (req, server) => handle(req, server.requestIP(req)?.address) })
  console.log(`StarPay API listening on http://127.0.0.1:${port}`)
  // Re-check unfinished payments in the background, so a closed browser tab never loses a verified payment.
  setInterval(() => void payments.sweepPayments(), 20_000)
  setInterval(() => void runDueSchedules().catch((e) => console.error('schedule failed', safeMessage(e))), 5 * 60_000)
}
