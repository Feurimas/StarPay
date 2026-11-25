export interface RegionalPrefs {
  timezone: string
  dateFormat: string
  numberFormat: string
}

export const DEFAULT_PREFS: RegionalPrefs = { timezone: 'UTC', dateFormat: 'auto', numberFormat: 'auto' }

const numberLocale = (p: RegionalPrefs) => (p.numberFormat === 'auto' ? undefined : p.numberFormat)

export function formatDate(value: string | Date, prefs: RegionalPrefs = DEFAULT_PREFS, withTime = false): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const time: Intl.DateTimeFormatOptions = withTime ? { hour: '2-digit', minute: '2-digit' } : {}
  const base = { timeZone: prefs.timezone, ...time }
  if (prefs.dateFormat === 'auto') return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}), timeZone: prefs.timezone }).format(date)
  const parts = new Intl.DateTimeFormat('en-US', { ...base, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = `${get('day')}/${get('month')}/${get('year')}`
  const mdy = `${get('month')}/${get('day')}/${get('year')}`
  const ymd = `${get('year')}-${get('month')}-${get('day')}`
  const text = prefs.dateFormat === 'dmy' ? day : prefs.dateFormat === 'ymd' ? ymd : mdy
  if (!withTime) return text
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timezone, hour: '2-digit', minute: '2-digit' }).format(date)
  return `${text} ${t}`
}

export function formatNumber(value: number, prefs: RegionalPrefs = DEFAULT_PREFS): string {
  return new Intl.NumberFormat(numberLocale(prefs)).format(value)
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(seconds, 'second')
}
