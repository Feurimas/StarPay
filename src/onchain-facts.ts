/**
 * Verified facts about the one network StarPay uses: Arc Testnet.
 *
 * Sources: Arc's official documentation (chain id, RPC, explorer, USDC), viem's chain definition, and a live read of the
 * USDC contract (name "USDC", symbol "USDC", 6 decimals at the ERC-20 interface). Native gas on Arc is USDC too, but the
 * native view uses 18 decimals while the ERC-20 view uses 6: they are the same money in two representations.
 */
import { arcTestnet } from 'viem/chains'

export interface ChainFacts {
  id: number
  name: string
  explorerBase: string
  rpcUrls: string[]
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export interface UsdcFacts {
  address: string
  /** Decimals of the ERC-20 interface. Never use this for native gas amounts. */
  decimals: number
  symbol: string
}

const ARC_TESTNET: ChainFacts = {
  id: arcTestnet.id,
  name: 'Arc Testnet',
  explorerBase: arcTestnet.blockExplorers.default.url.replace(/\/$/, ''),
  rpcUrls: [...arcTestnet.rpcUrls.default.http],
  nativeCurrency: { name: arcTestnet.nativeCurrency.name, symbol: arcTestnet.nativeCurrency.symbol, decimals: arcTestnet.nativeCurrency.decimals },
}

const CHAINS: Record<number, ChainFacts> = { [ARC_TESTNET.id]: ARC_TESTNET }

const USDC: Record<number, UsdcFacts> = {
  [ARC_TESTNET.id]: { address: '0x3600000000000000000000000000000000000000', decimals: 6, symbol: 'USDC' },
}

export const getChain = (chainId: number): ChainFacts | undefined => CHAINS[chainId]

export function requireChain(chainId: number): ChainFacts {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Chain ${chainId} is not supported. StarPay only uses Arc Testnet.`)
  return chain
}

export const getUsdc = (chainId: number): UsdcFacts | undefined => USDC[chainId]

export const buildTxExplorerUrl = (chainId: number, hash: string): string => `${requireChain(chainId).explorerBase}/tx/${hash}`
export const buildAddressExplorerUrl = (chainId: number, address: string): string => `${requireChain(chainId).explorerBase}/address/${address}`
