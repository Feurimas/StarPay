import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { ConnectWalletButton, useNetworkState, useUsdcBalance, WalletStatus } from '@/components/WalletStatus'
import { Alert, Button, Spinner } from '@/components/ui'
import { api, ApiError, errorMessage } from '@/lib/api'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, FAUCET_URL, USDC_ADDRESS, addressUrl, parseOnchainError, routerAbi, shortAddress, shortHash, txUrl } from '@/lib/onchain'
import { fmtUsdc } from '@/lib/usdc'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc } from '@/onchain-money'

export interface PaymentDto {
  id: string
  status: 'requested' | 'pending' | 'confirmed'
  invoiceRef: string
  merchant: string
  amount: string
  amountUnits: string
  chainId: number
  router: string
  txHash: string | null
  payer: string | null
  confirmedAt: string | null
  txs: { txHash: string; status: string; detail: string; at: string; explorerUrl: string }[]
}

interface Props {
  orderPublicId: string
  paymentStatus: string
  onChanged: () => void
}

export function PayPanel({ orderPublicId, paymentStatus, onChanged }: Props) {
  const [payment, setPayment] = useState<PaymentDto | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const base = `/public/orders/${orderPublicId}/payment`
  // the parent passes a new function every render: keep the latest one in a ref so effects do not re-run (and loop) on it
  const changed = useRef(onChanged)
  useEffect(() => {
    changed.current = onChanged
  })

  useEffect(() => {
    let cancelled = false
    api
      .post<{ payment: PaymentDto | null }>(base)
      .then((r) => !cancelled && setPayment(r.payment))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [base])

  // While a transaction is waiting for verification, ask the server to re-check it. The server decides; the UI only reports.
  const pending = payment?.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const live = { on: true }
    const timer = setInterval(() => {
      api
        .post<{ payment: PaymentDto | null; orderPaid: boolean }>(`${base}/refresh`)
        .then((r) => {
          if (!live.on) return
          setPayment(r.payment)
          if (r.orderPaid) changed.current()
        })
        .catch(() => undefined)
    }, 3000)
    return () => {
      live.on = false
      clearInterval(timer)
    }
  }, [pending, base])

  const confirmed = payment?.status === 'confirmed'
  useEffect(() => {
    if (confirmed) changed.current()
  }, [confirmed])

  if (loading) return <Spinner label="Loading payment" />
  if (paymentStatus === 'paid' || payment?.status === 'confirmed') return <PaidCard payment={payment} />
  if (error) return <Alert tone="info">{error}</Alert>
  if (!payment) return null

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6" aria-labelledby="pay-title">
      <h2 id="pay-title" className="display text-lg font-semibold">Pay with USDC</h2>
      <p className="mt-1 text-sm text-muted text-pretty">
        Your USDC goes straight from your wallet to {shortAddress(payment.merchant)} on {ARC_CHAIN_NAME}. StarPay never holds it.
      </p>
      <dl className="mt-4 grid gap-2 rounded-xl bg-surface-muted p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-subtle">Amount due</dt><dd className="text-lg font-semibold tabular-nums">{fmtUsdc(payment.amount)}</dd></div>
        <div><dt className="text-xs text-subtle">Recipient (merchant wallet)</dt><dd><a href={addressUrl(payment.merchant)} target="_blank" rel="noopener noreferrer" className="mono hover:underline">{shortAddress(payment.merchant)}</a></dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-subtle">Payment reference</dt><dd className="mono break-all text-xs text-ink-2">{payment.invoiceRef}</dd></div>
      </dl>

      {pending ? <Waiting payment={payment} /> : <PayFlow payment={payment} base={base} onUpdate={setPayment} />}
      <RejectedTxs payment={payment} />
    </section>
  )
}

function PaidCard({ payment }: { payment: PaymentDto | null }) {
  return (
    <section className="rounded-2xl border border-success/30 bg-success-soft p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
        <div className="min-w-0">
          <h2 className="display text-lg font-semibold text-success">Payment verified onchain</h2>
          {payment && <p className="mt-1 text-sm text-ink-2">{fmtUsdc(payment.amount)} was received by the merchant wallet.</p>}
          {payment?.txHash && (
            <a href={txUrl(payment.txHash)} target="_blank" rel="noopener noreferrer" className="mono mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success hover:underline">
              {shortHash(payment.txHash)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function Waiting({ payment }: { payment: PaymentDto }) {
  const open = payment.txs.find((t) => t.status === 'submitted')
  return (
    <div className="mt-4 rounded-xl border border-line p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Verifying your payment onchain</p>
      <p className="mt-1 text-xs text-muted">{open?.detail || 'The server is checking the transaction on Arc Testnet.'} This page updates by itself. The order is only marked paid after the check passes.</p>
      {open && <a href={open.explorerUrl} target="_blank" rel="noopener noreferrer" className="mono mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">{shortHash(open.txHash)} <ExternalLink className="h-3 w-3" aria-hidden /></a>}
    </div>
  )
}

function RejectedTxs({ payment }: { payment: PaymentDto }) {
  const failed = payment.txs.filter((t) => t.status === 'reverted' || t.status === 'rejected')
  if (failed.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      {failed.slice(0, 3).map((t) => (
        <Alert key={t.txHash} tone="error">
          <span className="block">{t.detail}</span>
          <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer" className="mono text-xs underline">{shortHash(t.txHash)}</a>
        </Alert>
      ))}
    </div>
  )
}

function PayFlow({ payment, base, onUpdate }: { payment: PaymentDto; base: string; onUpdate: (p: PaymentDto | null) => void }) {
  const { address } = useAccount()
  const net = useNetworkState()
  const balance = useUsdcBalance()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const amount = BigInt(payment.amountUnits)
  const router = payment.router as `0x${string}`

  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, router] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && !net.wrongNetwork, refetchInterval: 5000 },
  })
  const approve = useWriteContract()
  const pay = useWriteContract()
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data, chainId: ARC_CHAIN_ID })
  const payReceipt = useWaitForTransactionReceipt({ hash: pay.data, chainId: ARC_CHAIN_ID })
  const [submitError, setSubmitError] = useState('')
  const submitted = useRef<string | null>(null)
  const [fee, setFee] = useState<string | undefined>()

  const approved = (allowance.data ?? 0n) >= amount
  const enough = balance.raw !== undefined && balance.raw >= amount
  const refetchAllowance = allowance.refetch

  useEffect(() => {
    if (approveReceipt.isSuccess) void refetchAllowance()
  }, [approveReceipt.isSuccess, refetchAllowance])

  // Report the transaction hash to the server once. The server then verifies it independently.
  const payHash = pay.data
  useEffect(() => {
    if (!payHash || submitted.current === payHash) return
    submitted.current = payHash
    api
      .post<{ payment: PaymentDto }>(`${base}/submit`, { txHash: payHash })
      .then((r) => onUpdate(r.payment))
      .catch((e) => setSubmitError(errorMessage(e)))
  }, [payHash, base, onUpdate])

  // Network fee, shown in USDC. Arc charges gas in USDC; the native 18-decimal view is converted by the money module.
  useEffect(() => {
    if (!publicClient || !address || net.wrongNetwork) return
    let cancelled = false
    void (async () => {
      try {
        const gas = approved
          ? await publicClient.estimateContractGas({ address: router, abi: routerAbi, functionName: 'pay', args: [payment.invoiceRef as `0x${string}`, payment.merchant as `0x${string}`, amount], account: address })
          : await publicClient.estimateContractGas({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [router, amount], account: address })
        const fees = await publicClient.estimateFeesPerGas()
        const wei = gas * (fees.maxFeePerGas ?? 0n)
        const usdc = gasTokenToUsdc(ARC_CHAIN_ID, Amount.fromRaw(wei, gasTokenDecimalsFor(ARC_CHAIN_ID)))
        if (!cancelled) setFee(usdc.toFixed(4))
      } catch {
        if (!cancelled) setFee(undefined)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publicClient, address, net.wrongNetwork, approved, router, amount, payment.invoiceRef, payment.merchant])

  const approveErr = approve.error ? parseOnchainError(approve.error) : null
  const payErr = pay.error ? parseOnchainError(pay.error) : null
  const receiptErr = payReceipt.isError ? 'The transaction could not be confirmed. Check the explorer, then try again.' : ''

  if (!net.isConnected) {
    return (
      <div className="mt-4 space-y-3">
        <ConnectWalletButton label="Connect wallet to pay" />
        <p className="text-xs text-subtle">Use a browser wallet on {ARC_CHAIN_NAME}. StarPay never asks for your seed phrase or private key.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <WalletStatus />
      {!net.wrongNetwork && (
        <>
          {balance.raw !== undefined && !enough && (
            <Alert tone="warning">
              Your balance ({fmtUsdc(balance.text)}) is lower than the amount due. Add test USDC from the{' '}
              <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Circle faucet</a>, then come back.
            </Alert>
          )}
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${approved ? 'bg-success-soft text-success' : 'bg-ink text-white'}`}>{approved ? '✓' : '1'}</span>
              <span className={approved ? 'text-muted' : 'font-semibold'}>Allow StarPay to move exactly {fmtUsdc(payment.amount)} from your wallet</span>
            </li>
            <li className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${approved ? 'bg-ink text-white' : 'bg-surface-muted text-subtle'}`}>2</span>
              <span className={approved ? 'font-semibold' : 'text-muted'}>Send the payment to the merchant</span>
            </li>
          </ol>
          {!approved ? (
            <Button
              className="w-full min-h-12"
              disabled={!enough || allowance.isLoading}
              loading={approve.isPending || approveReceipt.isLoading}
              onClick={() => approve.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [router, amount], chainId: ARC_CHAIN_ID })}
            >
              {approve.isPending ? 'Confirm in your wallet' : approveReceipt.isLoading ? 'Waiting for the network' : `Allow ${fmtUsdc(payment.amount)}`}
            </Button>
          ) : (
            <Button
              className="w-full min-h-12"
              disabled={!enough}
              loading={pay.isPending || payReceipt.isLoading}
              onClick={() => {
                submitted.current = null
                setSubmitError('')
                pay.reset()
                pay.writeContract({ address: router, abi: routerAbi, functionName: 'pay', args: [payment.invoiceRef as `0x${string}`, payment.merchant as `0x${string}`, amount], chainId: ARC_CHAIN_ID })
              }}
            >
              {pay.isPending ? 'Confirm in your wallet' : payReceipt.isLoading ? 'Waiting for the network' : `Pay ${fmtUsdc(payment.amount)}`}
            </Button>
          )}
          <p className="text-xs text-subtle">
            Network fee{fee ? ` about ${fee} USDC` : ''}, paid in USDC from the same balance. Arc's fee design targets roughly 0.001 USDC per transfer under normal load.
          </p>
          {[approveErr, payErr].map((e, i) => e && <Alert key={i} tone={e.cancelled ? 'info' : 'error'}>{e.message}</Alert>)}
          {(receiptErr || submitError) && <Alert tone="error">{receiptErr || submitError}</Alert>}
          {pay.data && !payReceipt.isError && (
            <p className="text-xs text-muted">
              Transaction sent: <a href={txUrl(pay.data)} target="_blank" rel="noopener noreferrer" className="mono font-semibold text-brand hover:underline">{shortHash(pay.data)}</a>
            </p>
          )}
        </>
      )}
    </div>
  )
}
