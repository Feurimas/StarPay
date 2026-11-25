import { Check, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui'
import { PublicHero } from '@/components/PublicHero'
import { TiltCard } from '@/components/3DCard'

const TIERS = [
  {
    name: 'Starter',
    audience: 'Freelancers and new sellers',
    price: '$0',
    cycle: 'Testnet Free',
    points: ['One business workspace', 'Core commerce and USDC payments', 'Basic analytics & telemetry', 'Community documentation'],
    badge: 'FREE FOREVER',
    cardStyle: 'bg-surface/90 border border-line text-ink',
    btnStyle: 'bg-ink text-white hover:bg-ink-2',
    accentColor: 'text-accent',
  },
  {
    name: 'Growth',
    audience: 'Growing businesses and online merchants',
    price: '$29',
    cycle: 'per month',
    points: ['Multiple team members and 5 RBAC roles', '24/7 Customer inbox & AI assistant', 'Workflow visual automation engine', 'Priority live agent support'],
    badge: 'MOST POPULAR',
    popular: true,
    cardStyle: 'bg-gradient-to-b from-[#18181b] to-[#09090b] text-white border border-orange-500/40 shadow-2xl',
    btnStyle: 'bg-gradient-to-r from-[#ff5a1a] to-[#f97316] text-white hover:scale-105 shadow-lg',
    accentColor: 'text-emerald-400',
  },
  {
    name: 'Scale',
    audience: 'Agencies and multi-brand enterprises',
    price: '$89',
    cycle: 'per month',
    points: ['Unlimited business workspaces', 'Advanced financial reports & audit logs', 'High-throughput automation & AI quotas', 'Dedicated 24/7 technical architect'],
    badge: 'ENTERPRISE',
    cardStyle: 'bg-gradient-to-br from-[#ff5a1a]/15 via-surface to-surface border border-accent/40 text-ink',
    btnStyle: 'bg-ink text-white hover:bg-ink-2',
    accentColor: 'text-brand',
  },
]

export default function Pricing() {
  return (
    <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PublicHero
        eyebrow="Transparent & Predictable"
        title="Zero transaction cuts. Free on Arc Testnet."
        lead="Keep 100% of your customer revenue. StarPay charges zero take-rates on peer-to-peer USDC payments."
      />

      <div className="mb-10">
        <Alert tone="info">
          During development StarPay is 100% free to try on Arc Testnet. When mainnet launches, pricing will be a flat software subscription. USDC payments go directly to your wallet without intermediary custody.
        </Alert>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <TiltCard
            key={t.name}
            maxTilt={10}
            className={`flex flex-col justify-between rounded-3xl p-8 transition-all duration-300 hover:shadow-2xl ${t.cardStyle}`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
                  {t.name}
                </span>
                {t.popular ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1 font-mono text-[10px] font-bold text-white shadow-sm">
                    <Sparkles className="h-3 w-3" /> {t.badge}
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
                    {t.badge}
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="display text-5xl font-black">{t.price}</span>
                <span className="font-mono text-xs text-muted">/ {t.cycle}</span>
              </div>

              <p className="mt-2 text-sm text-muted">{t.audience}</p>

              <div className="my-6 border-t border-border/50" />

              <ul className="space-y-3">
                {t.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 text-sm">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${t.accentColor}`} />
                    <span className="leading-snug">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Link
                to="/signup"
                className={`flex min-h-12 w-full items-center justify-center rounded-full text-center text-sm font-semibold transition-all duration-200 ${t.btnStyle}`}
              >
                Get started free
              </Link>
            </div>
          </TiltCard>
        ))}
      </div>
    </div>
  )
}
