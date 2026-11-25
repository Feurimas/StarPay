import { emitEvent } from './workflowEngine'
import { randomBytes } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { audit, requireMember, type Ctx } from './context'
import { rows, sql } from './db'
import { asBody, badRequest, conflict, HttpError, isUuid, notFound, rateLimit, str, safeMessage } from './http'
import { payoutMessage } from '../src/lib/payout'
import { big, usd } from './money'
import { CHAIN_ID, chainClient, findPaymentTx, ROUTER_ADDRESS, ROUTER_DEPLOY_BLOCK, USDC_ADDRESS, verifyPaymentTx, type ExpectedPayment } from './chain'

interface PaymentRow {
  id: string
  workspace_id: string
  order_id: string
  invoice_ref: string
  merchant_address: string
  amount_units: unknown
  chain_id: number
  router_address: string
  status: 'requested' | 'pending' | 'confirmed'
  payer_address: string | null
  tx_hash: string | null
  block_number: unknown
  confirmed_at: Date | null
  start_block: unknown
  created_at: Date
}

interface TxRow {
  tx_hash: string
  status: string
  detail: string
  payer_address: string | null
  created_at: Date
}

const TX_RE = /^0x[0-9a-fA-F]{64}$/
const toExpected = (p: PaymentRow): ExpectedPayment => ({ invoiceRef: p.invoice_ref, merchant: p.merchant_address, amountUnits: big(p.amount_units), router: p.router_address })

async function paymentDto(p: PaymentRow) {
  const txs = await rows<TxRow>(sql`SELECT tx_hash, status, detail, payer_address, created_at FROM payment_txs WHERE payment_id = ${p.id} ORDER BY created_at DESC`)
  return {
    id: p.id,
    status: p.status,
    invoiceRef: p.invoice_ref,
    merchant: p.merchant_address,
    amount: usd(p.amount_units),
    amountUnits: String(big(p.amount_units)),
    chainId: p.chain_id,
    router: p.router_address,
    usdc: USDC_ADDRESS,
    txHash: p.tx_hash,
    payer: p.payer_address,
    blockNumber: p.block_number === null ? null : String(big(p.block_number)),
    confirmedAt: p.confirmed_at,
    txs: txs.map((t) => ({ txHash: t.tx_hash, status: t.status, detail: t.detail, payer: t.payer_address, at: t.created_at, explorerUrl: buildTxExplorerUrl(CHAIN_ID, t.tx_hash) })),
  }
}

// ---------- creating the payment request ----------
interface OrderForPayment {
  id: string
  workspace_id: string
  status: string
  payment_status: string
  total_units: unknown
  payout_address: string | null
}

async function ensurePayment(order: OrderForPayment): Promise<PaymentRow> {
  const existing = await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${order.id}`)
  if (existing[0]) {
    const p = existing[0]
    // Until a payment is in flight, follow the merchant's current payout wallet.
    if (p.status === 'requested' && order.payout_address && order.payout_address.toLowerCase() !== p.merchant_address.toLowerCase()) {
      await sql`UPDATE payments SET merchant_address = ${order.payout_address}, updated_at = now() WHERE id = ${p.id} AND status = 'requested'`
      return (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${p.id}`))[0]!
    }
    return p
  }
  if (!ROUTER_ADDRESS) throw new HttpError(503, 'Payments are not configured yet.', 'payments_unavailable')
  if (order.status === 'cancelled') throw conflict('This order was cancelled.')
  if (order.payment_status !== 'unpaid') throw conflict('This order does not need a payment.')
  if (!order.payout_address) throw conflict('This business has not connected a payout wallet yet, so it cannot accept USDC payments.')
  const total = big(order.total_units)
  if (total <= 0n) throw conflict('There is nothing to pay on this order.')
  let startBlock = ROUTER_DEPLOY_BLOCK
  try {
    const head = await chainClient().getBlockNumber()
    startBlock = head > 20n ? head - 20n : head
  } catch {
    // Fall back to the deployment block: discovery then scans a little more.
  }
  const ref = `0x${randomBytes(32).toString('hex')}`
  await sql`
    INSERT INTO payments (workspace_id, order_id, invoice_ref, merchant_address, amount_units, chain_id, router_address, start_block)
    VALUES (${order.workspace_id}, ${order.id}, ${ref}, ${order.payout_address}, ${total.toString()}, ${CHAIN_ID}, ${ROUTER_ADDRESS}, ${startBlock.toString()})
    ON CONFLICT (order_id) DO NOTHING`
  return (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${order.id}`))[0]!
}

async function loadPublicOrder(publicId: string): Promise<OrderForPayment> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(publicId)) throw notFound('Order not found.')
  const found = await rows<OrderForPayment>(sql`
    SELECT o.id, o.workspace_id, o.status, o.payment_status, o.total_units, w.payout_address
    FROM orders o JOIN workspaces w ON w.id = o.workspace_id WHERE o.public_id = ${publicId} AND w.deleted_at IS NULL`)
  if (!found[0]) throw notFound('Order not found.')
  return found[0]
}

// ---------- verification (idempotent) ----------
async function applyOutcome(paymentId: string, txHash: string): Promise<void> {
  const hash = txHash.toLowerCase()
  const current = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${paymentId}`))[0]
  if (!current) return
  if (current.status === 'confirmed') {
    if ((current.tx_hash ?? '').toLowerCase() !== hash) {
      await sql`UPDATE payment_txs SET status = 'rejected', detail = 'This order was already paid by another transaction.', checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash} AND status = 'submitted'`
    }
    return
  }
  let outcome
  try {
    outcome = await verifyPaymentTx(toExpected(current), hash)
  } catch (e) {
    await sql`UPDATE payment_txs SET detail = ${'Could not reach the network. Retrying.'}, checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash} AND status = 'submitted'`
    console.error('Payment verification could not complete:', safeMessage(e))
    return
  }
  let newlyPaid: { workspaceId: string; orderId: string } | null = null
  await sql.begin(async (tx) => {
    // Serialize concurrent verifications of the same payment; the first confirmation wins.
    const locked = (await rows<PaymentRow>(tx`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`))[0]!
    if (locked.status === 'confirmed') return
    const row = (await rows<{ status: string; created_at: Date }>(tx`SELECT status, created_at FROM payment_txs WHERE payment_id = ${paymentId} AND tx_hash = ${hash} FOR UPDATE`))[0]
    if (!row || row.status !== 'submitted') return

    if (outcome.kind === 'pending') {
      const stale = Date.now() - row.created_at.getTime() > 30 * 60_000 && outcome.detail.startsWith('Waiting for the transaction')
      if (stale) {
        await tx`UPDATE payment_txs SET status = 'rejected', detail = 'The transaction was never found on Arc Testnet.', checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash}`
        await tx`UPDATE payments SET status = 'requested', updated_at = now() WHERE id = ${paymentId}`
      } else {
        await tx`UPDATE payment_txs SET detail = ${outcome.detail}, checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash}`
        await tx`UPDATE payments SET status = 'pending', updated_at = now() WHERE id = ${paymentId}`
      }
      return
    }
    if (outcome.kind === 'reverted' || outcome.kind === 'rejected') {
      await tx`UPDATE payment_txs SET status = ${outcome.kind}, detail = ${outcome.detail}, checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash}`
      const others = await rows<{ n: number }>(tx`SELECT count(*)::int AS n FROM payment_txs WHERE payment_id = ${paymentId} AND status = 'submitted'`)
      if ((others[0]?.n ?? 0) === 0) await tx`UPDATE payments SET status = 'requested', updated_at = now() WHERE id = ${paymentId}`
      return
    }
    // Confirmed: record the payment and mark the order paid in the same transaction.
    await tx`UPDATE payment_txs SET status = 'confirmed', detail = ${outcome.detail}, payer_address = ${outcome.payer}, block_number = ${outcome.blockNumber.toString()}, checked_at = now() WHERE payment_id = ${paymentId} AND tx_hash = ${hash}`
    await tx`
      UPDATE payments SET status = 'confirmed', tx_hash = ${hash}, payer_address = ${outcome.payer}, block_number = ${outcome.blockNumber.toString()},
        confirmed_at = now(), updated_at = now() WHERE id = ${paymentId}`
    const paid = await rows<{ id: string }>(tx`UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE id = ${locked.order_id} AND payment_status = 'unpaid' RETURNING id`)
    if (paid[0]) {
      newlyPaid = { workspaceId: locked.workspace_id, orderId: locked.order_id }
      await tx`INSERT INTO order_events (order_id, kind, detail) VALUES (${locked.order_id}, 'payment', ${`USDC payment verified onchain (${hash.slice(0, 10)}...${hash.slice(-6)})`})`
      await tx`
        INSERT INTO audit_logs (workspace_id, action, target_type, target_id, metadata)
        VALUES (${locked.workspace_id}, 'payment.verified', 'order', ${locked.order_id}, ${JSON.stringify({ txHash: hash, amountUnits: String(big(locked.amount_units)) })}::text::jsonb)`
    }
  })
  const paidNow = newlyPaid as { workspaceId: string; orderId: string } | null
  if (paidNow) emitEvent(paidNow.workspaceId, 'payment.verified', { orderId: paidNow.orderId })
}

async function recordTx(payment: PaymentRow, txHash: string): Promise<void> {
  const hash = txHash.toLowerCase()
  // A transaction hash is public the moment it is broadcast, so anyone can submit it against any order. Each (order, hash)
  // pair is therefore tracked on its own: someone submitting your hash to their order can neither block nor change
  // yours. Verification checks the invoice reference inside the transaction, so a hash can only ever confirm the order it paid.
  const inserted = await rows<{ tx_hash: string }>(sql`
    INSERT INTO payment_txs (tx_hash, payment_id, status) VALUES (${hash}, ${payment.id}, 'submitted')
    ON CONFLICT (payment_id, tx_hash) DO NOTHING RETURNING tx_hash`)
  if (inserted[0]) await sql`UPDATE payments SET status = 'pending', updated_at = now() WHERE id = ${payment.id} AND status = 'requested'`
}

/** Re-checks every unfinished transaction and, if none was reported, looks the payment up by its reference. */
async function refreshPayment(paymentId: string): Promise<PaymentRow> {
  let p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${paymentId}`))[0]!
  if (p.status === 'confirmed') return p
  const open = await rows<{ tx_hash: string }>(sql`SELECT tx_hash FROM payment_txs WHERE payment_id = ${paymentId} AND status = 'submitted'`)
  for (const t of open) await applyOutcome(paymentId, t.tx_hash)
  p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${paymentId}`))[0]!
  if (p.status === 'requested') {
    try {
      const found = await findPaymentTx(toExpected(p), big(p.start_block))
      if (found) {
        await recordTx(p, found)
        await applyOutcome(paymentId, found)
        p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${paymentId}`))[0]!
      }
    } catch (e) {
      console.error('Payment lookup failed:', safeMessage(e))
    }
  }
  return p
}

// ---------- public (payer) endpoints ----------
export async function paymentConfig() {
  return { enabled: !!ROUTER_ADDRESS, chainId: CHAIN_ID, router: ROUTER_ADDRESS, usdc: USDC_ADDRESS }
}

export async function requestPayment(ctx: Ctx) {
  rateLimit(`payreq:${ctx.ip}`, 30, 15 * 60_000)
  const order = await loadPublicOrder(ctx.params.oid ?? '')
  if (order.payment_status === 'paid') {
    const p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${order.id}`))[0]
    return { payment: p ? await paymentDto(p) : null, orderPaid: true }
  }
  const payment = await ensurePayment(order)
  return { payment: await paymentDto(payment), orderPaid: payment.status === 'confirmed' }
}

export async function submitPayment(ctx: Ctx) {
  rateLimit(`paysubmit:${ctx.ip}`, 30, 15 * 60_000)
  const order = await loadPublicOrder(ctx.params.oid ?? '')
  const hash = str(asBody(await ctx.body()), 'txHash', { min: 66, max: 66 })
  if (!TX_RE.test(hash)) throw badRequest('That is not a valid transaction hash.')
  const payment = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${order.id}`))[0]
  if (!payment) throw conflict('Start the payment first.')
  if (payment.status !== 'confirmed') {
    await recordTx(payment, hash)
    await applyOutcome(payment.id, hash)
  }
  const fresh = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${payment.id}`))[0]!
  return { payment: await paymentDto(fresh) }
}

export async function refreshPublicPayment(ctx: Ctx) {
  rateLimit(`payrefresh:${ctx.ip}`, 120, 5 * 60_000)
  const order = await loadPublicOrder(ctx.params.oid ?? '')
  const payment = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${order.id}`))[0]
  if (!payment) return { payment: null, orderPaid: order.payment_status === 'paid' }
  const fresh = await refreshPayment(payment.id)
  return { payment: await paymentDto(fresh), orderPaid: fresh.status === 'confirmed' }
}

// ---------- merchant endpoints ----------
export async function merchantRequestPayment(ctx: Ctx) {
  const m = await requireMember(ctx, 'payments.manage')
  const oid = ctx.params.oid ?? ''
  if (!isUuid(oid)) throw notFound('Order not found.')
  const order = (await rows<OrderForPayment>(sql`
    SELECT o.id, o.workspace_id, o.status, o.payment_status, o.total_units, w.payout_address
    FROM orders o JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ${oid} AND o.workspace_id = ${m.workspace.id}`))[0]
  if (!order) throw notFound('Order not found.')
  const payment = await ensurePayment(order)
  await audit(ctx, m.workspace.id, 'payment.requested', { type: 'order', id: oid })
  return { payment: await paymentDto(payment) }
}

export async function merchantOrderPayment(ctx: Ctx) {
  const m = await requireMember(ctx, 'payments.view')
  const oid = ctx.params.oid ?? ''
  if (!isUuid(oid)) throw notFound('Order not found.')
  const p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE order_id = ${oid} AND workspace_id = ${m.workspace.id}`))[0]
  return { payment: p ? await paymentDto(p) : null }
}

export async function merchantRefreshPayment(ctx: Ctx) {
  const m = await requireMember(ctx, 'payments.manage')
  rateLimit(`merchrefresh:${m.user.id}`, 60, 5 * 60_000)
  const pid = ctx.params.pid ?? ''
  if (!isUuid(pid)) throw notFound('Payment not found.')
  const p = (await rows<PaymentRow>(sql`SELECT * FROM payments WHERE id = ${pid} AND workspace_id = ${m.workspace.id}`))[0]
  if (!p) throw notFound('Payment not found.')
  return { payment: await paymentDto(await refreshPayment(p.id)) }
}

export async function listPayments(ctx: Ctx) {
  const m = await requireMember(ctx, 'payments.view')
  const list = await rows<PaymentRow & { order_number: unknown; customer_name: string; order_status: string }>(sql`
    SELECT p.*, o.number AS order_number, o.customer_name, o.status AS order_status
    FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.workspace_id = ${m.workspace.id} ORDER BY p.created_at DESC LIMIT 200`)
  const sums = await rows<{ confirmed: number; confirmed_units: unknown; pending: number; pending_units: unknown; requested: number; requested_units: unknown }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'confirmed'), 0) AS confirmed_units,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'pending'), 0) AS pending_units,
      count(*) FILTER (WHERE status = 'requested')::int AS requested,
      COALESCE(sum(amount_units) FILTER (WHERE status = 'requested'), 0) AS requested_units
    FROM payments WHERE workspace_id = ${m.workspace.id}`)
  const s = sums[0]!
  const payments = await Promise.all(list.map(async (p) => ({ ...(await paymentDto(p)), orderId: p.order_id, orderNumber: String(big(p.order_number)), customerName: p.customer_name, createdAt: p.created_at })))
  return {
    source: 'onchain-verified-and-pending',
    enabled: !!ROUTER_ADDRESS,
    summary: {
      verifiedCount: s.confirmed, verifiedAmount: usd(s.confirmed_units),
      pendingCount: s.pending, pendingAmount: usd(s.pending_units),
      awaitingCount: s.requested, awaitingAmount: usd(s.requested_units),
    },
    payments,
  }
}

// ---------- payout wallet ----------
export async function getPayout(ctx: Ctx) {
  const m = await requireMember(ctx, 'payments.view')
  const w = (await rows<{ payout_address: string | null; payout_verified_at: Date | null }>(sql`SELECT payout_address, payout_verified_at FROM workspaces WHERE id = ${m.workspace.id}`))[0]!
  return { address: w.payout_address, verifiedAt: w.payout_verified_at, configured: !!ROUTER_ADDRESS, chainId: CHAIN_ID, router: ROUTER_ADDRESS }
}

export async function setPayout(ctx: Ctx) {
  const m = await requireMember(ctx, 'payout.manage')
  rateLimit(`payout:${m.user.id}`, 10, 15 * 60_000)
  const body = asBody(await ctx.body())
  const raw = str(body, 'address', { min: 42, max: 42 })
  if (!isAddress(raw)) throw badRequest('Enter a valid wallet address.')
  const address = getAddress(raw)
  if (/^0x0{40}$/.test(address) || address === ROUTER_ADDRESS || address === USDC_ADDRESS) throw badRequest('That address cannot receive payments.')
  const issuedAt = str(body, 'issuedAt', { max: 40 })
  const age = Date.now() - new Date(issuedAt).getTime()
  if (!Number.isFinite(age) || age < -60_000 || age > 10 * 60_000) throw badRequest('That signature has expired. Sign again.')
  const signature = str(body, 'signature', { min: 10, max: 1200 })
  let valid = false
  try {
    valid = await chainClient().verifyMessage({ address, message: payoutMessage(m.workspace.id, address, issuedAt), signature: signature as `0x${string}` })
  } catch {
    valid = false
  }
  if (!valid) throw badRequest('The signature does not match this wallet. Connect the wallet and sign again.')
  await sql`UPDATE workspaces SET payout_address = ${address}, payout_verified_at = now() WHERE id = ${m.workspace.id}`
  await audit(ctx, m.workspace.id, 'payout.set', { type: 'workspace', id: m.workspace.id }, { address })
  return { ok: true, address }
}

// ---------- background sweeper ----------
let sweeping = false
export async function sweepPayments(): Promise<void> {
  if (sweeping || !ROUTER_ADDRESS) return
  sweeping = true
  try {
    const due = await rows<{ id: string }>(sql`
      SELECT DISTINCT p.id FROM payments p
      WHERE p.status <> 'confirmed' AND p.created_at > now() - interval '2 days'
        AND (p.status = 'pending' OR p.created_at > now() - interval '30 minutes')
      ORDER BY p.id LIMIT 30`)
    for (const p of due) await refreshPayment(p.id)
  } catch (e) {
    console.error('Payment sweep failed:', safeMessage(e))
  } finally {
    sweeping = false
  }
}
