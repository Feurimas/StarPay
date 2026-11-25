import { LogOut, Wallet } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useDisconnect, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { Alert, Button } from '@/components/ui'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, USDC_ADDRESS, addressUrl, shortAddress } from '@/lib/onchain'
import { fmtUsdc } from '@/lib/usdc'

/** One real USDC balance (the 6-decimal ERC-20 view). The native gas view is the same pool and is never shown separately. */
export function useUsdcBalance() {
  const { address } = useAccount()
  const query = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const raw = query.data
  return {
    raw,
    text: raw === undefined ? undefined : Amount.fromRaw(raw, usdcDecimalsFor(ARC_CHAIN_ID)).toString(),
    loading: query.isLoading,
    refetch: query.refetch,
  }
}

export function useNetworkState() {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount()
  const { switchChain, isPending: switching, error } = useSwitchChain()
  return {
    address,
    isConnected,
    connecting: isConnecting || isReconnecting,
    wrongNetwork: isConnected && chainId !== ARC_CHAIN_ID,
    switching,
    switchError: error,
    switchToArc: () => switchChain({ chainId: ARC_CHAIN_ID }),
  }
}

export function ConnectWalletButton({ label = 'Connect wallet' }: { label?: string }) {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <Button onClick={show} loading={isConnecting} className="w-full min-h-12">
          <Wallet className="h-4 w-4" aria-hidden /> {label}
        </Button>
      )}
    </ConnectKitButton.Custom>
  )
}

/** Connected wallet card: address, active network, USDC balance and disconnect. */
export function WalletStatus() {
  const { address, isConnected, wrongNetwork, switching, switchToArc } = useNetworkState()
  const { chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const balance = useUsdcBalance()

  if (!isConnected || !address) return <ConnectWalletButton />
  return (
    <div className="rounded-2xl border border-line bg-surface-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">Connected wallet</p>
          <a href={addressUrl(address)} target="_blank" rel="noopener noreferrer" className="mono mt-1 block break-all text-sm font-medium hover:underline">{address}</a>
          <p className="mt-1 text-xs text-muted">{address && shortAddress(address)} on {chainId === ARC_CHAIN_ID ? ARC_CHAIN_NAME : `chain ${chainId ?? 'unknown'}`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => disconnect()} aria-label="Disconnect wallet"><LogOut className="h-4 w-4" aria-hidden /> Disconnect</Button>
      </div>
      {wrongNetwork ? (
        <div className="mt-3 space-y-2">
          <Alert tone="warning">Your wallet is not on {ARC_CHAIN_NAME}. Switch networks to continue.</Alert>
          <Button onClick={switchToArc} loading={switching} className="w-full">Switch to {ARC_CHAIN_NAME}</Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <TokenUSDC variant="branded" size={20} />
          <span className="text-muted">USDC balance</span>
          <span className="ml-auto font-semibold tabular-nums">{balance.text === undefined ? (balance.loading ? 'Loading...' : 'Unavailable') : fmtUsdc(balance.text)}</span>
        </div>
      )}
    </div>
  )
}
