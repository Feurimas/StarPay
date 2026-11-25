/**
 * Money helpers. All amounts are integers of the smallest unit, never floats.
 *
 * On Arc the native gas token and the USDC ERC-20 are one pool of money shown with different decimals (18 native,
 * 6 ERC-20). Convert between the two views only with gasTokenToUsdc and usdcToGasToken.
 */
import { requireChain, getUsdc } from './onchain-facts'

export class AmountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmountError'
  }
}

export const USDC_DECIMALS = 6

const pow10 = (n: number) => 10n ** BigInt(n)

function trimmed(raw: bigint, decimals: number): string {
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const whole = abs / pow10(decimals)
  const fraction = (abs % pow10(decimals)).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** "12.5" to 12_500_000n. Plain non-negative decimals with at most 6 decimal places only. */
export function parseUsdc(value: string): bigint {
  if (typeof value !== 'string') throw new AmountError('Amount must be text.')
  const v = value.trim()
  const match = /^(\d*)(?:\.(\d{1,6}))?$/.exec(v)
  if (!match || (match[1] === '' && match[2] === undefined)) throw new AmountError('Amount must be a plain number with at most 6 decimals.')
  return BigInt(match[1] || '0') * pow10(USDC_DECIMALS) + BigInt((match[2] ?? '').padEnd(USDC_DECIMALS, '0') || '0')
}

/** 12_500_000n to "12.5". Whole amounts have no decimal point. */
export const formatUsdc = (units: bigint): string => trimmed(units, USDC_DECIMALS)

/** An amount with its decimals attached, so two views of the same money cannot be mixed up. */
export class Amount {
  private constructor(
    readonly raw: bigint,
    readonly decimals: number,
  ) {}

  static fromRaw(raw: bigint, decimals: number): Amount {
    return new Amount(raw, decimals)
  }

  toString(): string {
    return trimmed(this.raw, this.decimals)
  }

  /** Fixed number of decimals, rounded up so a fee is never understated. */
  toFixed(places: number): string {
    const scale = this.decimals - places
    const units = scale > 0 ? (this.raw + pow10(scale) - 1n) / pow10(scale) : this.raw * pow10(-scale)
    const text = units.toString().padStart(places + 1, '0')
    return places === 0 ? text : `${text.slice(0, -places)}.${text.slice(-places)}`
  }
}

export function usdcDecimalsFor(chainId: number): number {
  const usdc = getUsdc(chainId)
  if (!usdc) throw new Error(`No USDC facts for chain ${chainId}.`)
  return usdc.decimals
}

export const gasTokenDecimalsFor = (chainId: number): number => requireChain(chainId).nativeCurrency.decimals

/** Native gas units (18 decimals) to the ERC-20 USDC view (6 decimals), rounding up. */
export function gasTokenToUsdc(chainId: number, amount: Amount): Amount {
  const from = gasTokenDecimalsFor(chainId)
  const to = usdcDecimalsFor(chainId)
  if (amount.decimals !== from) throw new AmountError('That amount is not a native gas amount.')
  const scale = pow10(from - to)
  return Amount.fromRaw((amount.raw + scale - 1n) / scale, to)
}

/** ERC-20 USDC units (6 decimals) to native gas units (18 decimals). Exact. */
export function usdcToGasToken(chainId: number, amount: Amount): Amount {
  const from = usdcDecimalsFor(chainId)
  const to = gasTokenDecimalsFor(chainId)
  if (amount.decimals !== from) throw new AmountError('That amount is not an ERC-20 USDC amount.')
  return Amount.fromRaw(amount.raw * pow10(to - from), to)
}
