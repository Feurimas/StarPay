/**
 * Live end-to-end check of the Arc USDC payment flow on Arc Testnet.
 * Real transactions from throwaway test wallets (keys live only in /tmp, never printed).
 * Run with: bun run server/payment-e2e.ts   (API must not be required: it calls the app in-process)
 */
/* oxlint-disable no-explicit-any */
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { payoutMessage } from '../src/lib/payout'
import { migrate, sql } from './db'
import { handle } from './index'
import { ROUTER_ADDRESS, USDC_ADDRESS } from './chain'

const keys = JSON.parse(readFileSync('/tmp/starpay-e2e-wallets.json', 'utf8')) as { payer: `0x${string}`; merchant: `0x${string}` }
const payer = privateKeyToAccount(keys.payer)
const merchant = privateKeyToAccount(keys.merchant)
const rpc = arcTestnet.rpcUrls.default.http[0]
const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
const wallet = createWalletClient({ account: payer, chain: arcTestnet, transport: http(rpc) })
const routerAbi = parseAbi(['function pay(bytes32 invoiceRef, address merchant, uint256 amount)'])

process.env.TRUST_PROXY = 'true'
let ipN = 0
const cookies: Record<string, string> = {}
async function call(method: string, path: string, body?: unknown, as = 'owner'): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'x-forwarded-for': `10.9.${++ipN % 250}.${Math.floor(ipN / 250)}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET') headers['x-requested-with'] = 'fetch'
  if (as !== 'public' && cookies[as]) headers.cookie = cookies[as]!
  const res = await handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(';')[0]!
    if (as !== 'public' && pair.startsWith('sp_session=')) cookies[as] = pair
  }
  return { status: res.status, data: await res.json().catch(() => null) }
}

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`)
  if (!ok) failures += 1
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const usdcBal = async (a: `0x${string}`) => pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

async function pollPaid(oid: string, tries = 30): Promise<any> {
  let last: any
  for (let i = 0; i < tries; i++) {
    last = (await call('POST', `/public/orders/${oid}/payment/refresh`, {}, 'public')).data
    if (last?.orderPaid) return last
    await wait(2000)
  }
  return last
}

await migrate()
const email = `e2e${Date.now()}@example.com`
const signup = await call('POST', '/auth/signup', { name: 'E2E Merchant', email, password: 'e2e-password-123' })
check('merchant signs up', signup.status === 200)
const ws = (await call('POST', '/workspaces', { name: 'E2E Shop', country: 'US' })).data.id as string
const w = `/workspaces/${ws}`

// Payments cannot start before a payout wallet exists.
const product = (await call('POST', `${w}/products`, { name: 'E2E item', description: 'test', price: '0.25', status: 'active', trackInventory: false })).data
await call('PUT', `${w}/storefront`, { slug: `e2e-${Date.now().toString(36)}`, title: 'E2E', tagline: '', description: '', published: true })
const store = (await call('GET', `${w}/storefront`)).data.storefront
const place = async (qty = 1) => (await call('POST', `/public/stores/${store.slug}/orders`, { items: [{ productId: product.id, quantity: qty }], customer: { name: 'Pat Payer', email: 'pat@example.com', country: 'US' } }, 'public')).data.publicId as string

const o0 = await place()
const noPayout = await call('POST', `/public/orders/${o0}/payment`, {}, 'public')
check('payment request refused until a payout wallet is set', noPayout.status === 409, noPayout.data?.error?.message)

// Wrong signature is rejected; the merchant wallet's real signature is accepted.
const issuedAt = new Date().toISOString()
const badSig = await merchant.signMessage({ message: payoutMessage(ws, getAddress(merchant.address), 'tampered') })
const rejected = await call('PUT', `${w}/payout`, { address: merchant.address, issuedAt, signature: badSig })
check('payout wallet rejected when the signature is for different text', rejected.status === 400)
const okSig = await merchant.signMessage({ message: payoutMessage(ws, getAddress(merchant.address), issuedAt) })
const saved = await call('PUT', `${w}/payout`, { address: merchant.address, issuedAt, signature: okSig })
check('payout wallet accepted with a valid signature', saved.status === 200, saved.data?.error?.message)

const funded = await usdcBal(payer.address)
console.log(`payer USDC balance: ${funded} base units`)
if (funded < 3_000_000n) {
  console.log('SKIP live payments: payer wallet is not funded yet')
  process.exit(failures ? 1 : 0)
}

// ---- Order A: the happy path, real transactions ----
const oA = await place()
const intentA = await call('POST', `/public/orders/${oA}/payment`, {}, 'public')
check('payment request created with a unique reference', intentA.status === 200 && /^0x[0-9a-f]{64}$/.test(intentA.data.payment.invoiceRef), intentA.data?.error?.message)
const A = intentA.data.payment
const again = await call('POST', `/public/orders/${oA}/payment`, {}, 'public')
check('requesting again returns the same reference', again.data.payment.invoiceRef === A.invoiceRef)
const amountA = BigInt(A.amountUnits)

const before = await usdcBal(merchant.address)
const approveTx = await wallet.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS!, amountA] })
await pub.waitForTransactionReceipt({ hash: approveTx })
const payTx = await wallet.writeContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [A.invoiceRef, A.merchant, amountA] })
console.log('pay tx', payTx)
const early = await call('GET', `/public/orders/${oA}`, undefined, 'public')
check('order is still unpaid before the server has verified anything', early.data.order.paymentStatus === 'unpaid')
const sub = await call('POST', `/public/orders/${oA}/payment/submit`, { txHash: payTx }, 'public')
check('submitting the transaction hash is accepted', sub.status === 200, sub.data?.error?.message)
const done = await pollPaid(oA)
check('server verified the payment onchain and marked the order paid', done?.orderPaid === true)
const after = await usdcBal(merchant.address)
check('merchant wallet received exactly the invoice amount', after - before === amountA, `${after - before}`)
check('router never holds USDC', (await usdcBal(ROUTER_ADDRESS!)) === 0n)
const paidOrder = (await call('GET', `/public/orders/${oA}`, undefined, 'public')).data.order
check('public order shows paid', paidOrder.paymentStatus === 'paid')

// ---- Idempotency, replay, duplicates ----
const resub = await call('POST', `/public/orders/${oA}/payment/submit`, { txHash: payTx }, 'public')
check('resubmitting the same transaction is idempotent', resub.status === 200 && resub.data.payment.status === 'confirmed')
const rows = await sql`SELECT count(*)::int AS n FROM payment_txs WHERE tx_hash = ${payTx.toLowerCase()}`
check('the transaction is stored once', rows[0].n === 1)
const oB = await place()
const B = (await call('POST', `/public/orders/${oB}/payment`, {}, 'public')).data.payment
const replay = await call('POST', `/public/orders/${oB}/payment/submit`, { txHash: payTx }, 'public')
check('replaying order A\'s transaction on order B is rejected for B', replay.status === 200 && replay.data.payment.txs[0]?.status === 'rejected' && replay.data.payment.status !== 'confirmed', replay.data?.payment?.txs?.[0]?.detail ?? replay.data?.error?.message)
const orderBAfter = (await call('GET', `/public/orders/${oB}`, undefined, 'public')).data.order
check('order B stays unpaid after the replay attempt', orderBAfter.paymentStatus === 'unpaid')

// ---- Griefing: someone submits a customer's hash to THEIR order first; the customer must still get verified ----
const oC = await place()
const oD = await place()
const C = (await call('POST', `/public/orders/${oC}/payment`, {}, 'public')).data.payment
await call('POST', `/public/orders/${oD}/payment`, {}, 'public')
const amountC = BigInt(C.amountUnits)
await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS!, amountC] }) })
const txC = await wallet.writeContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [C.invoiceRef, C.merchant, amountC] })
await pub.waitForTransactionReceipt({ hash: txC })
const grief = await call('POST', `/public/orders/${oD}/payment/submit`, { txHash: txC }, 'public')
check('an attacker submitting the customer\'s hash to their own order gets nothing', grief.status === 200 && grief.data.orderPaid !== true)
const genuine = await call('POST', `/public/orders/${oC}/payment/submit`, { txHash: txC }, 'public')
check('the genuine order is still accepted and verified afterwards', genuine.status === 200, genuine.data?.error?.message)
const doneC = await pollPaid(oC)
check('order C is marked paid despite the attacker getting there first', doneC?.orderPaid === true)
const dAfter = (await call('GET', `/public/orders/${oD}`, undefined, 'public')).data.order
check('the attacker\'s order stays unpaid', dAfter.paymentStatus === 'unpaid')
const dupOnchain = await pub.simulateContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [A.invoiceRef, A.merchant, amountA], account: payer }).then(() => false, () => true)
check('the contract itself refuses to pay order A twice', dupOnchain)

// ---- Wrong terms: a real payment with a different amount must not mark the order paid ----
const amountB = BigInt(B.amountUnits)
const wrongAmount = amountB - 1n
const approveWrong = await wallet.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS!, wrongAmount] })
await pub.waitForTransactionReceipt({ hash: approveWrong })
const wrongTx = await wallet.writeContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [B.invoiceRef, B.merchant, wrongAmount] })
await pub.waitForTransactionReceipt({ hash: wrongTx })
const wrongSub = await call('POST', `/public/orders/${oB}/payment/submit`, { txHash: wrongTx }, 'public')
const wrongTxStatus = wrongSub.data?.payment?.txs?.find((t: any) => t.txHash.toLowerCase() === wrongTx.toLowerCase())
check('a payment with the wrong amount is rejected', wrongTxStatus?.status === 'rejected', wrongTxStatus?.detail)
check('order B is still unpaid after the wrong-amount payment', (await call('GET', `/public/orders/${oB}`, undefined, 'public')).data.order.paymentStatus === 'unpaid')

// ---- A reverted transaction (no allowance left) is recorded as failed ----
const revertTx = await wallet.writeContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [B.invoiceRef, B.merchant, amountB], gas: 300_000n })
await pub.waitForTransactionReceipt({ hash: revertTx }).catch(() => undefined)
const revSub = await call('POST', `/public/orders/${oB}/payment/submit`, { txHash: revertTx }, 'public')
const revStatus = revSub.data?.payment?.txs?.find((t: any) => t.txHash.toLowerCase() === revertTx.toLowerCase())
check('a reverted transaction is recorded as reverted', revStatus?.status === 'reverted', revStatus?.detail)
check('order B is still unpaid after the revert', (await call('GET', `/public/orders/${oB}`, undefined, 'public')).data.order.paymentStatus === 'unpaid')

// ---- Recovery: the payer pays correctly but never tells the server the hash ----
const approveB = await wallet.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS!, amountB] })
await pub.waitForTransactionReceipt({ hash: approveB })
const goodB = await wallet.writeContract({ address: ROUTER_ADDRESS!, abi: routerAbi, functionName: 'pay', args: [B.invoiceRef, B.merchant, amountB] })
await pub.waitForTransactionReceipt({ hash: goodB })
const found = await pollPaid(oB, 20)
check('a payment the browser never reported is still found by its reference and verified', found?.orderPaid === true)
const finalB = (await call('POST', `/public/orders/${oB}/payment/refresh`, {}, 'public')).data.payment
check('the stored transaction is the real one', finalB.txHash?.toLowerCase() === goodB.toLowerCase())

// ---- Merchant history ----
const hist = await call('GET', `${w}/payments`)
check('merchant history shows three verified payments (orders A, C and the unreported one)', hist.data.summary.verifiedCount === 3 && hist.data.summary.verifiedAmount === '0.75', JSON.stringify(hist.data.summary))
const other = await call('POST', '/auth/signup', { name: 'Other Org', email: `o${email}`, password: 'e2e-password-123' }, 'other')
check('another organization cannot read this payment history', (await call('GET', `${w}/payments`, undefined, 'other')).status === 404 && other.status === 200)

console.log(failures === 0 ? '\nALL LIVE PAYMENT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
