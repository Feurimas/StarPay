import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAccount, useSignMessage } from 'wagmi'
import { useWorkspace } from '@/auth/WorkspaceContext'
import { ConnectWalletButton, useNetworkState, WalletStatus } from '@/components/WalletStatus'
import { Alert, Button, Card, CardHeader, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { ARC_CHAIN_NAME, addressUrl, parseOnchainError } from '@/lib/onchain'
import { payoutMessage } from '@/lib/payout'

interface Payout {
  address: string | null
  verifiedAt: string | null
  configured: boolean
  router: string | null
}

export default function Wallet() {
  const { workspace, can, prefs } = useWorkspace()
  const { address } = useAccount()
  const net = useNetworkState()
  const { signMessageAsync, isPending } = useSignMessage()
  const [payout, setPayout] = useState<Payout | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [tick, setTick] = useState(0)
  const manage = can('payout.manage')

  useEffect(() => {
    let cancelled = false
    api.get<Payout>(`/workspaces/${workspace.id}/payout`).then((r) => !cancelled && setPayout(r)).catch((e) => toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [workspace.id, tick])

  const sameAsConnected = !!payout?.address && !!address && payout.address.toLowerCase() === address.toLowerCase()

  const save = async () => {
    if (!address) return
    setError('')
    setSaving(true)
    try {
      const issuedAt = new Date().toISOString()
      const signature = await signMessageAsync({ message: payoutMessage(workspace.id, address, issuedAt) })
      await api.put(`/workspaces/${workspace.id}/payout`, { address, issuedAt, signature })
      toast.success('Payout wallet saved.')
      setTick((t) => t + 1)
    } catch (e) {
      const parsed = parseOnchainError(e)
      setError(e instanceof Error && e.name === 'ApiError' ? e.message : parsed.cancelled ? parsed.message : errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (!payout) return <Spinner label="Loading wallet settings" />

  return (
    <>
      <PageHeader title="Wallet and payouts" description={`Customers pay in USDC on ${ARC_CHAIN_NAME}, straight to the wallet you choose here.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your wallet" description="Connect the browser wallet you want to use. StarPay never sees your keys." />
          <div className="space-y-4 p-5 sm:p-6">
            <WalletStatus />
            {net.isConnected && !net.wrongNetwork && manage && (
              <>
                {error && <Alert tone="error">{error}</Alert>}
                <Button onClick={() => void save()} loading={saving || isPending} disabled={sameAsConnected} className="w-full min-h-12">
                  {sameAsConnected ? 'This wallet is your payout wallet' : 'Use this wallet for payouts'}
                </Button>
                <p className="text-xs text-subtle">You will be asked to sign a short message. It proves you control the wallet and costs no gas.</p>
              </>
            )}
            {!net.isConnected && !manage && <ConnectWalletButton />}
            {!manage && <Alert tone="info">Only owners and admins can change the payout wallet.</Alert>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payout wallet" description="Where customer USDC is sent." />
          <div className="space-y-4 p-5 sm:p-6">
            {payout.address ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
                <div className="min-w-0">
                  <a href={addressUrl(payout.address)} target="_blank" rel="noopener noreferrer" className="mono break-all text-sm font-semibold hover:underline">{payout.address}</a>
                  {payout.verifiedAt && <p className="mt-1 text-xs text-muted">Ownership proved by signature on {formatDate(payout.verifiedAt, prefs, true)}.</p>}
                </div>
              </div>
            ) : (
              <Alert tone="warning">No payout wallet yet. Customers cannot pay in USDC until you set one.</Alert>
            )}
            <div className="rounded-xl bg-surface-muted p-4 text-sm text-ink-2">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-brand" aria-hidden /> How money moves</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>Each payment goes from the customer's wallet to your wallet. There is no StarPay wallet in between and no pooled funds.</li>
                <li>An order is marked paid only after the server verifies the transaction on {ARC_CHAIN_NAME}.</li>
                <li>Refunds are separate transfers that you send yourself from your wallet.</li>
              </ul>
            </div>
            {payout.router ? (
              <a href={addressUrl(payout.router)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                View the payment contract on the explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <Alert tone="warning">The payment contract is not configured on this server.</Alert>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
