import { Calculator, Database, Layers, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Badge } from '@/components/ui'

/** Where a number comes from. Charts and cards always say, so verified money is never confused with records or estimates. */
export type Source = 'onchain' | 'offchain' | 'mixed' | 'estimate'

const SOURCE_COPY: Record<Source, { label: string; tone: 'success' | 'neutral' | 'brand' | 'violet'; hint: string; Icon: typeof Database }> = {
  onchain: { label: 'Onchain verified', tone: 'success', hint: 'Confirmed on Arc Testnet by the server', Icon: ShieldCheck },
  offchain: { label: 'Offchain record', tone: 'neutral', hint: 'Stored in StarPay, not proven onchain', Icon: Database },
  mixed: { label: 'Onchain and offchain', tone: 'violet', hint: 'A ratio of a verified figure and a record', Icon: Layers },
  estimate: { label: 'Estimate', tone: 'brand', hint: 'A simple projection, not a forecast', Icon: Calculator },
}

export function SourceBadge({ source }: { source: Source }) {
  const { label, tone, Icon, hint } = SOURCE_COPY[source]
  return (
    <span title={hint}>
      <Badge tone={tone}>
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </Badge>
    </span>
  )
}

export const SOURCE_KEYS = Object.keys(SOURCE_COPY) as Source[]
export const sourceHint = (s: Source) => SOURCE_COPY[s].hint

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export interface Series {
  key: string
  label: string
  values: number[]
  color: string
  dashed?: boolean
}

interface ChartProps {
  days: string[]
  series: Series[]
  format: (n: number) => string
  label: string
  kind?: 'line' | 'bar'
  height?: number
}

const PAD = { l: 44, r: 12, t: 14, b: 28 }

/** A dependency-free chart. Hover or touch shows the exact figures for a day. */
export function TrendChart({ days, series, format, label, kind = 'line', height = 220 }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId()
  // draw at the real pixel width so labels stay readable on phones instead of shrinking with the viewBox
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const n = days.length
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const top = max === 0 ? 1 : max * 1.1
  const innerW = W - PAD.l - PAD.r
  const innerH = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH
  const empty = max === 0
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const bw = Math.max(2, Math.min(18, innerW / Math.max(1, n) / Math.max(1, series.length) - 2))

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / innerW) * (n - 1)))))
  }

  const summary = `${label}. ${series.map((s) => `${s.label}: total ${format(s.values.reduce((a, b) => a + b, 0))}`).join('. ')}.`

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        className="block max-w-full touch-pan-y select-none"
        role="img"
        aria-label={summary}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(top * t)} y2={y(top * t)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(top * t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">
              {empty ? (t === 0 ? '0' : '') : compact.format(top * t)}
            </text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => n > 0 && a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">
            {days[i] ? shortDay(days[i]) : ''}
          </text>
        ))}
        {kind === 'line' &&
          series.map((s, si) => {
            const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
            return (
              <g key={s.key}>
                {si === 0 && n > 1 && (
                  <>
                    <defs>
                      <linearGradient id={`${uid}-fill`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${d} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#${uid}-fill)`} />
                  </>
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            )
          })}
        {kind === 'bar' &&
          series.map((s, si) =>
            s.values.map((v, i) => (
              <rect key={`${s.key}${i}`} x={x(i) - (bw * series.length) / 2 + si * bw} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx="2" fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />
            )),
          )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            {kind === 'line' && series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {empty && <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-muted">No activity in this period yet.</p>}
      {hover !== null && days[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border border-line bg-surface p-2.5 text-xs shadow-card"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 4rem), calc(100% - 9.5rem))` }}
        >
          <p className="mb-1 font-semibold">{shortDay(days[hover])}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
              <span className="font-semibold tabular-nums">{format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color, opacity: i.dashed ? 0.6 : 1 }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export interface Slice {
  label: string
  value: number
  color: string
}

export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const R = 42
  const C = 2 * Math.PI * R
  const arcs = slices.filter((s) => s.value > 0).map((s, i, all) => ({ ...s, start: all.slice(0, i).reduce((a, b) => a + b.value, 0) }))
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 110 110" className="h-36 w-36 shrink-0" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--surface-muted)" strokeWidth="14" />
        {total > 0 &&
          arcs.map((s) => {
            const len = (s.value / total) * C
            return <circle key={s.label} cx="55" cy="55" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-(s.start / total) * C} transform="rotate(-90 55 55)" />
          })}
        <text x="55" y="53" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)">{total}</text>
        <text x="55" y="67" textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">{centerLabel.toUpperCase()}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BarList({ rows }: { rows: { label: string; value: number; text: string; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.text}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></div>
          {r.note && <p className="mt-1 text-xs text-muted">{r.note}</p>}
        </li>
      ))}
    </ul>
  )
}
