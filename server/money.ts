import { AmountError, formatUsdc, parseUsdc } from '@/onchain-money'
import { badRequest } from './http'

/** Database bigint columns may arrive as string, number or bigint. */
export const big = (value: unknown): bigint => BigInt(String(value ?? 0))

/** USDC base units to a plain decimal string such as "12.5". */
export const usd = (value: unknown): string => formatUsdc(big(value))

const MAX_UNITS = parseUsdc('1000000000')

/** Parses a user-entered USDC amount. Never accepts more than 6 fraction digits. */
export function parsePrice(raw: unknown, label: string, opts: { allowZero?: boolean } = {}): bigint {
  if (typeof raw !== 'string' && typeof raw !== 'number') throw badRequest(`${label} is required.`)
  let units: bigint
  try {
    units = parseUsdc(String(raw))
  } catch (e) {
    if (e instanceof AmountError) throw badRequest(`${label} must be a plain amount with at most 6 decimals, for example 12.50.`)
    throw e
  }
  if (units < 0n || (units === 0n && !opts.allowZero)) throw badRequest(`${label} must be greater than zero.`)
  if (units > MAX_UNITS) throw badRequest(`${label} is too large.`)
  return units
}

/** Applies a discount row to a subtotal. Percent is whole percent (1-100); fixed is USDC units. */
export function discountAmount(kind: string, value: bigint, subtotal: bigint): bigint {
  const raw = kind === 'percent' ? (subtotal * value) / 100n : value
  return raw > subtotal ? subtotal : raw
}
