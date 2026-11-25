import { Check, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui'
import { PublicHero } from '@/components/PublicHero'
import { TiltCard } from '@/components/3DCard'
import { MODULES } from './content'

const GRADIENTS = [
  'from-amber-500 via-orange-500 to-rose-500',
  'from-orange-500 via-rose-500 to-pink-500',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-violet-500 via-purple-500 to-indigo-500',
  'from-blue-500 via-indigo-500 to-violet-500',
  'from-rose-500 via-pink-500 to-purple-500',
]

export default function Features() {
  return (
    <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {/* Background ambient orbs */}
      <div className="pointer-events-none absolute -left-32 top-20 -z-10 h-96 w-96 rounded-full bg-orange-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-1/2 -z-10 h-96 w-96 rounded-full bg-purple-500/15 blur-3xl" />

      <PublicHero
        eyebrow="3D Architecture & Features"
        title="Everything your business needs in one 3D canvas."
        lead="Autonomous store catalogs, peer-to-peer USDC payments on Arc, and continuous AI orchestration."
      />

      <div className="mb-8 flex items-center justify-between rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink">
            Interactive 3D Tilt Cards Active
          </span>
        </div>
        <span className="font-mono text-xs text-muted">Hover & Move Cursor to Inspect Depth</span>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m, i) => {
          const grad = GRADIENTS[i % GRADIENTS.length]
          return (
            <TiltCard
              key={m.name}
              maxTilt={12}
              className="flex flex-col rounded-3xl border border-line bg-surface/90 p-7 shadow-card transition-all duration-300 hover:border-accent/40 hover:shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-xs font-bold text-accent">MODULE {String(i + 1).padStart(2, '0')}</span>
                <Badge tone={m.status === 'Available now' ? 'success' : 'neutral'}>{m.status}</Badge>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr ${grad} text-white shadow-lg`}>
                  <m.icon className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <h2 className="display text-xl font-bold leading-tight text-ink">{m.name}</h2>
                  <span className="font-mono text-[11px] text-muted">Arc + Supabase</span>
                </div>
              </div>

              <p className="mt-4 text-[14px] text-ink-2 leading-relaxed text-pretty">{m.summary}</p>

              <ul className="mt-6 space-y-2.5 border-t border-line/60 pt-5">
                {m.details.map((d) => (
                  <li key={d} className="flex items-start gap-2.5 text-[13px] text-ink-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="text-pretty">{d}</span>
                  </li>
                ))}
              </ul>
            </TiltCard>
          )
        })}
      </div>
    </div>
  )
}
