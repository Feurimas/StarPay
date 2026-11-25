import { parseAbi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc } from '@/onchain-facts'

/** Arc Testnet is the only network StarPay uses during development. Every fact comes from the facts module. */
export const ARC_CHAIN_ID = arcTestnet.id
export const ARC_CHAIN_NAME = 'Arc Testnet'

const usdc = getUsdc(ARC_CHAIN_ID)
if (!usdc) throw new Error('USDC is missing for Arc Testnet in the onchain facts module')
export const USDC_ADDRESS = usdc.address as `0x${string}`

export const routerAbi = parseAbi(['function pay(bytes32 invoiceRef, address merchant, uint256 amount)'])

export const txUrl = (hash: string) => buildTxExplorerUrl(ARC_CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(ARC_CHAIN_ID, address)
export const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
export const shortHash = (h: string) => `${h.slice(0, 10)}...${h.slice(-6)}`

export const FAUCET_URL = 'https://faucet.circle.com'

export interface ParsedOnchainError {
  message: string
  /** True when the person simply closed the wallet prompt. That is not an error. */
  cancelled: boolean
}

export function parseOnchainError(error: unknown): ParsedOnchainError {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  const text = raw.toLowerCase()
  const code = (error as { code?: number } | null)?.code
  if (code === 4001 || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
    return { message: 'You cancelled the request in your wallet.', cancelled: true }
  }
  if (text.includes('insufficient funds') || text.includes('exceeds the balance') || text.includes('transfer amount exceeds balance')) {
    return { message: 'Your wallet does not have enough USDC for this payment and the network fee.', cancelled: false }
  }
  if (text.includes('allowance')) return { message: 'USDC spending was not approved for this amount. Approve it, then pay.', cancelled: false }
  if (text.includes('alreadypaid')) return { message: 'These exact payment terms were already paid.', cancelled: false }
  if (text.includes('blocklist') || text.includes('blocked')) return { message: 'A wallet involved in this payment is blocked from using USDC.', cancelled: false }
  if (text.includes('chain') && text.includes('mismatch')) return { message: 'Your wallet is on the wrong network. Switch to Arc Testnet.', cancelled: false }
  if (text.includes('reverted')) return { message: 'The transaction would fail onchain, so it was not sent. Check your balance and approval.', cancelled: false }
  if (text.includes('network') || text.includes('timeout') || text.includes('fetch')) return { message: 'Network problem. Check your connection and try again.', cancelled: false }
  return { message: 'The wallet request failed. Please try again.', cancelled: false }
}
