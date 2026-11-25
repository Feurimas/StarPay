import { createPublicClient, decodeEventLog, getAddress, http, isAddress, parseAbi, type Hex, type PublicClient } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

/**
 * Arc Testnet only. Every fact comes from Arc Studio's onchain facts module, which mirrors the
 * official Arc documentation (chain id 5042002; the ERC-20 USDC interface has 6 decimals).
 */
export const CHAIN_ID = arcTestnet.id
const CHAIN = requireChain(CHAIN_ID)
const USDC = getUsdc(CHAIN_ID)
if (!USDC) throw new Error('USDC is missing for Arc Testnet in the onchain facts module')
export const USDC_ADDRESS = getAddress(USDC.address)
export const EXPLORER_BASE = CHAIN.explorerBase

export const ROUTER_ADDRESS: `0x${string}` | null = (() => {
  const raw = process.env.VITE_PAYMENT_ROUTER_ADDRESS
  return raw && isAddress(raw) ? getAddress(raw) : null
})()
export const ROUTER_DEPLOY_BLOCK = BigInt(process.env.VITE_PAYMENT_ROUTER_DEPLOY_BLOCK ?? '0')

export const routerAbi = parseAbi([
  'event PaymentReceived(bytes32 indexed invoiceRef, address indexed merchant, address indexed payer, uint256 amount, bytes32 paymentId)',
  'function paymentIdOf(bytes32 invoiceRef, address merchant, uint256 amount) pure returns (bytes32)',
  'function isPaid(bytes32 invoiceRef, address merchant, uint256 amount) view returns (bool)',
])
const erc20TransferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])

/** Backend RPC: the sandbox proxy first when it serves this chain, public RPC from the facts module otherwise. */
function rpcUrl(): string {
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
  const override = process.env.RPC_URL_Arc_Testnet
  if (override) return override
  if (process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc_Testnet')) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
  }
  return CHAIN.rpcUrls[0]!
}

let client: PublicClient | null = null
export function chainClient(): PublicClient {
  client ??= createPublicClient({ chain: arcTestnet, transport: http(rpcUrl(), { retryCount: 3, retryDelay: 400, timeout: 15_000 }) }) as PublicClient
  return client
}

export type TxOutcome =
  | { kind: 'pending'; detail: string }
  | { kind: 'reverted'; detail: string }
  | { kind: 'rejected'; detail: string }
  | { kind: 'confirmed'; detail: string; payer: string; blockNumber: bigint }

export interface ExpectedPayment {
  invoiceRef: string
  merchant: string
  amountUnits: bigint
  router: string
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Independent verification of one transaction against what the server itself stored for the order.
 * Nothing here trusts the browser: the network, the contract, the USDC asset, the recipient, the
 * amount and the reference are all re-read from the chain and compared with the stored request.
 */
export async function verifyPaymentTx(expected: ExpectedPayment, txHash: string): Promise<TxOutcome> {
  const c = chainClient()
  // 1. Correct network.
  const chainId = await c.getChainId()
  if (chainId !== CHAIN_ID) throw new Error(`RPC reports chain ${chainId}, expected Arc Testnet (${CHAIN_ID})`)

  let receipt
  try {
    receipt = await c.getTransactionReceipt({ hash: txHash as Hex })
  } catch (e) {
    if (e instanceof Error && e.name === 'TransactionReceiptNotFoundError') return { kind: 'pending', detail: 'Waiting for the transaction to be included in a block.' }
    throw e
  }
  // 2. Successful onchain transaction.
  if (receipt.status !== 'success') return { kind: 'reverted', detail: 'The transaction failed onchain. No USDC moved.' }

  // 3. Correct contract and 5. matching reference, recipient and amount, read from the router's own event.
  let routerLogs = 0
  let match: { payer: string } | null = null
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, expected.router)) continue
    try {
      const ev = decodeEventLog({ abi: routerAbi, data: log.data, topics: log.topics })
      if (ev.eventName !== 'PaymentReceived') continue
      routerLogs += 1
      const a = ev.args
      if (a.invoiceRef.toLowerCase() === expected.invoiceRef.toLowerCase() && sameAddress(a.merchant, expected.merchant) && a.amount === expected.amountUnits) {
        match = { payer: a.payer }
      }
    } catch {
      // Not a PaymentReceived log.
    }
  }
  if (!match) {
    return {
      kind: 'rejected',
      detail: routerLogs === 0 ? 'This transaction is not a StarPay payment.' : 'This transaction paid different terms (reference, recipient or amount) than this order.',
    }
  }

  // 4. Genuine USDC: the ERC-20 interface at the official address must show the same movement.
  // Arc also emits a native 18-decimal system log for the same transfer; only the ERC-20 log (6 decimals) is read here.
  const transfer = receipt.logs.find((log) => {
    if (!sameAddress(log.address, USDC_ADDRESS)) return false
    try {
      const ev = decodeEventLog({ abi: erc20TransferAbi, data: log.data, topics: log.topics })
      return sameAddress(ev.args.from, match.payer) && sameAddress(ev.args.to, expected.merchant) && ev.args.value === expected.amountUnits
    } catch {
      return false
    }
  })
  if (!transfer) return { kind: 'rejected', detail: 'The USDC transfer to the merchant was not found in this transaction.' }

  // 6. Finality. Arc finalizes a block as it is committed (no reorgs), so inclusion is enough once the
  // node we asked agrees the block is canonical. Guard against a lagging backend behind the load balancer.
  const latest = await c.getBlockNumber()
  if (receipt.blockNumber > latest) return { kind: 'pending', detail: 'Waiting for the network to catch up.' }
  const block = await c.getBlock({ blockNumber: receipt.blockNumber })
  if (block.hash !== receipt.blockHash) return { kind: 'pending', detail: 'Waiting for the block to settle.' }

  return { kind: 'confirmed', detail: 'Verified onchain.', payer: getAddress(match.payer), blockNumber: receipt.blockNumber }
}

/** Finds a payment for this reference even if the payer never told the server the transaction hash. */
export async function findPaymentTx(expected: ExpectedPayment, fromBlock: bigint): Promise<string | null> {
  const c = chainClient()
  const latest = await c.getBlockNumber()
  const start = fromBlock > ROUTER_DEPLOY_BLOCK ? fromBlock : ROUTER_DEPLOY_BLOCK
  const step = 5_000n
  for (let from = start; from <= latest; from += step) {
    const to = from + step - 1n > latest ? latest : from + step - 1n
    const logs = await c.getLogs({
      address: expected.router as `0x${string}`,
      event: routerAbi[0],
      args: { invoiceRef: expected.invoiceRef as Hex },
      fromBlock: from,
      toBlock: to,
    })
    const hit = logs.find((l) => sameAddress(l.args.merchant ?? '', expected.merchant) && l.args.amount === expected.amountUnits)
    if (hit?.transactionHash) return hit.transactionHash
  }
  return null
}
