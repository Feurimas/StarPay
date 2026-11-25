import { formatUsdc, parseUsdc } from '@/onchain-money'

/**
 * Display helper for USDC amounts that arrive from the API as plain decimal strings ("12.5").
 * Always shows at least two decimals and keeps every digit the amount really has (up to six).
 */
export function fmtUsdc(value: string | null | undefined, withUnit = true): string {
  if (value === null || value === undefined || value === '') return ''
  let text: string
  try {
    text = formatUsdc(parseUsdc(value))
  } catch {
    return value
  }
  const [whole = '0', fraction = ''] = text.split('.')
  const grouped = BigInt(whole).toLocaleString('en-US')
  const out = `${grouped}.${fraction.padEnd(2, '0')}`
  return withUnit ? `${out} USDC` : out
}

/** Normalizes user input like "12," or ".5" into a plain decimal, or returns null if unusable. */
export function cleanAmountInput(value: string): string | null {
  const v = value.trim().replace(',', '.')
  if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return null
  try {
    parseUsdc(v)
    return v
  } catch {
    return null
  }
}
