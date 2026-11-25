import { ArrowRight, Bot, CreditCard, ShoppingBag, Workflow, Sparkles, TrendingUp, ShieldCheck, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { SphereArt } from '@/components/art'
import { Hero3D } from '@/components/Hero3D'
import { TiltCard } from '@/components/3DCard'

const OPERATORS = [
  {
    icon: Bot,
    name: 'StarPay AI',
    role: 'Autonomous business agent',
    line: ['DRAFTS REPLIES & ANALYZES.', 'NEVER RISKS STORE ASSETS.'],
    color: 'from-amber-500 via-orange-500 to-rose-500',
    stat: '24/7 Agent',
  },
  {
    icon: ShoppingBag,
    name: 'Commerce Engine',
    role: 'Storefront & Inventory',
    line: ['CATALOG, LIVE CHECKOUT,', 'INVOICES IN ONE UNIFIED SUITE.'],
    color: 'from-orange-500 via-rose-500 to-pink-500',
    stat: 'Instant Invoicing',
  },
  {
    icon: CreditCard,
    name: 'USDC on Arc',
    role: 'Direct Peer-to-Peer Wallet',
    line: ['DIRECT TO YOUR WALLET.', 'VERIFIED DETERMINISTICALLY.'],
    color: 'from-emerald-500 via-teal-500 to-cyan-500',
    stat: '0% Chargebacks',
  },
  {
    icon: Workflow,
    name: 'Connect & Automate',
    role: 'Visual Workflows & Triggers',
    line: ['OMNICHANNEL INBOX,', 'EVENT RUNS WITH ZERO CODING.'],
    color: 'from-violet-500 via-purple-500 to-indigo-500',
    stat: 'Event Triggers',
  },
]

const STATS = [
  { label: 'Settlement Time', value: '< 2s', icon: Zap, detail: 'Arc Deterministic Finality' },
  { label: 'Intermediary Cut', value: '0.0%', icon: ShieldCheck, detail: 'Direct Customer-to-Merchant' },
  { label: 'Platform Availability', value: '99.9%', icon: TrendingUp, detail: 'Supabase & Arc Infrastructure' },
  { label: 'Autonomous AI', value: 'Active', icon: Sparkles, detail: 'Continuous Store Monitoring' },
]

const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-all duration-300'

export default function Landing() {
  const { user } = useAuth()
  const start = user ? '/app' : '/signup'

  return (
    <div className="relative overflow-hidden">
      {/* Background Decorative Ambient Colorful Lights */}
      <div className="pointer-events-none absolute -left-40 top-0 -z-10 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-orange-400/20 via-pink-400/15 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-1/3 -z-10 h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-purple-500/15 via-rose-400/10 to-transparent blur-3xl" />

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div>
            {/* Colorful Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-rose-500/10 to-amber-500/10 px-4 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-accent animate-ping" />
              <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-brand">
                Arc Testnet • Live 3D Experience • Supabase Cloud
              </p>
            </div>

            <h1 className="hero-title mt-6 text-[3.4rem] text-balance sm:text-7xl lg:text-[5.5rem] leading-[0.96]">
              Autonomous commerce, paid in{' '}
              <span className="bg-gradient-to-r from-[#ff5a1a] via-[#ff782d] to-[#ec4899] bg-clip-text text-transparent">
                USDC.
              </span>
            </h1>

            <p className="mt-6 max-w-lg font-mono text-[13.5px] leading-relaxed text-ink-2 text-pretty">
              StarPay connects your store, customers and business workflows to an AI agent your team controls. Payments go straight to your wallet and are verified with deterministic onchain finality.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to={start}
                className={`${btn} bg-gradient-to-r from-[#ff5a1a] via-[#ff6a24] to-[#f59e0b] text-ink shadow-[0_8px_25px_-5px_rgba(255,90,26,0.5)] hover:shadow-[0_12px_32px_-4px_rgba(255,90,26,0.65)] hover:scale-105 active:scale-95`}
              >
                {user ? 'Open your workspace' : 'Start free on Arc Testnet'}{' '}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/how-it-works"
                className="group flex items-center gap-1.5 border-b border-ink/40 pb-0.5 font-mono text-[13px] text-ink hover:border-brand hover:text-brand transition-colors"
              >
                <span>Explore 3D architecture</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>

            {/* Quick Live Stats Pill Row */}
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map((s) => {
                const Icon = s.icon
                return (
                  <div key={s.label} className="rounded-2xl border border-border/50 bg-surface/70 p-3 shadow-sm backdrop-blur-md">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Icon className="h-3.5 w-3.5 text-accent" />
                      <span className="font-mono text-[10px] uppercase tracking-wider">{s.label}</span>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold text-ink">{s.value}</p>
                    <p className="truncate text-[10px] text-muted">{s.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 3D WebGL Hero Canvas Scene */}
          <div className="relative">
            <Hero3D className="mx-auto w-full max-w-[42rem] shadow-2xl" />
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-8">
          <span className="eyebrow !text-accent font-bold">01 / 04</span>
          <span className="hidden h-px flex-1 bg-gradient-to-r from-accent/50 via-line to-transparent sm:block" />
          <span className="eyebrow ml-auto">
            Non-Custodial • Verified Onchain • Human in the Loop • Supabase DB
          </span>
        </div>
      </section>

      {/* Operators Section with 3D Tilt Cards */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <p className="eyebrow !text-ink">Next-Generation Platform Modules</p>
        </div>

        <div className="mt-3 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <h2 className="hero-title text-[2.6rem] text-balance sm:text-6xl">
            Built for operators, powered by intelligent 3D logic.
          </h2>
          <p className="serif max-w-sm text-[17px] leading-snug text-ink-2 text-pretty">
            One fluid workspace combining high-converting storefronts, non-custodial crypto payments, customer messaging, and an AI agent calibrated to your business knowledge.
          </p>
          <dl className="flex gap-6 border-l border-line pl-6">
            <div>
              <dt className="sr-only">Modules</dt>
              <dd className="display bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-4xl font-bold text-transparent">
                6
              </dd>
              <dd className="eyebrow">core engines</dd>
            </div>
            <div>
              <dt className="sr-only">Team roles</dt>
              <dd className="display bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
                5
              </dd>
              <dd className="eyebrow">RBAC roles</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATORS.map((o) => (
            <TiltCard
              key={o.name}
              maxTilt={12}
              className="rounded-3xl border border-line/70 bg-surface/90 shadow-card transition-all duration-300 hover:border-accent/50 hover:shadow-xl"
            >
              <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-t-3xl bg-gradient-to-br from-surface-muted via-canvas to-surface sm:h-44">
                {/* Decorative vibrant circle behind icon */}
                <div className={`absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-to-tr ${o.color} opacity-20 blur-xl`} />
                
                <span className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr ${o.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                  <o.icon className="h-8 w-8" aria-hidden />
                </span>

                <span className="absolute left-3 top-3 rounded-full border border-border/40 bg-surface/80 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted backdrop-blur-sm">
                  {o.stat}
                </span>
              </div>

              <div className="m-3 rounded-2xl border border-line bg-canvas p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="display text-[16px] font-bold text-ink">{o.name}</h3>
                  <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                </div>
                <p className="mt-1 font-mono text-[12px] text-ink-2">{o.role}</p>
                <div className="mt-4 border-t border-line/60 pt-3">
                  <p className="eyebrow !text-muted">
                    {o.line[0]}
                    <br />
                    {o.line[1]}
                  </p>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* Services Steps with 3D Tilt Cards */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
        <div className="border-t border-line pt-8">
          <p className="eyebrow !text-accent">Execution Blueprint</p>
          <div className="mt-3 grid items-end gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <h2 className="hero-title text-[2.6rem] text-balance sm:text-6xl">
              From first product listing to automated settlement.
            </h2>
            <p className="serif max-w-sm text-[17px] leading-snug text-ink-2 text-pretty lg:justify-self-end">
              Sell anywhere, receive USDC directly into your wallet without custodial middle-men, and deploy an AI assistant for round-the-clock support.
            </p>
          </div>
        </div>

        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <TiltCard className="rounded-3xl border border-line bg-surface/90 p-7 shadow-card hover:border-orange-500/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-accent">STEP 01</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/10 text-accent">
                <ShoppingBag className="h-4 w-4" />
              </span>
            </div>
            <h3 className="display mt-6 text-2xl font-bold leading-tight text-ink">
              Publish your customized storefront
            </h3>
            <p className="mt-3 text-sm text-ink-2 leading-relaxed">
              Launch product catalogs, take orders from custom shareable links, and generate automatic invoices with real-time stock reservations.
            </p>
            <Link
              to="/features"
              className="mt-8 inline-flex min-h-10 items-center gap-1 rounded-full bg-surface-muted px-4 text-[13px] font-semibold text-ink hover:bg-orange-500/15 hover:text-accent transition-colors"
            >
              Explore features →
            </Link>
          </TiltCard>

          {/* Step 2 */}
          <TiltCard className="rounded-3xl border border-ink/10 bg-gradient-to-b from-[#18181b] to-[#09090b] p-7 text-white shadow-2xl hover:border-emerald-500/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-emerald-400">STEP 02</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <CreditCard className="h-4 w-4" />
              </span>
            </div>
            <h3 className="display mt-6 text-2xl font-bold leading-tight text-white">
              USDC on Arc: Peer-to-Peer Settlement
            </h3>
            <p className="mt-3 text-sm text-white/80 leading-relaxed">
              Customers pay directly from their Web3 wallet. The server checks the onchain transaction log before marking the invoice paid. No chargebacks.
            </p>
            <Link
              to="/how-it-works"
              className="mt-8 inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-4 text-[13px] font-semibold text-ink hover:bg-emerald-400 transition-colors"
            >
              How verification works →
            </Link>
          </TiltCard>

          {/* Step 3 */}
          <TiltCard className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-[#ff5a1a] via-[#f97316] to-[#ea580c] p-7 text-white shadow-xl hover:shadow-[0_15px_35px_-5px_rgba(255,90,26,0.5)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-white/90">STEP 03</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white">
                <Bot className="h-4 w-4" />
              </span>
            </div>
            <h3 className="display mt-6 text-2xl font-bold leading-tight text-white">
              Autonomous AI Agent & Live Support
            </h3>
            <p className="mt-3 text-sm text-white/90 leading-relaxed">
              Answer customer questions from your company knowledge base, draft emails, and run automated order fulfillment pipelines.
            </p>
            <Link
              to="/docs"
              className="mt-8 inline-flex min-h-10 items-center gap-1 rounded-full bg-white/95 px-4 text-[13px] font-semibold text-ink hover:bg-white transition-colors"
            >
              Read technical specs →
            </Link>
          </TiltCard>
        </div>
      </section>

      {/* Modern Gradient CTA Banner */}
      <section className="mx-auto max-w-6xl px-3 pt-24 pb-16 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#ff5a1a] via-[#f59e0b] to-[#ec4899] p-8 sm:p-14 shadow-[0_20px_60px_-15px_rgba(255,90,26,0.45)]">
          <SphereArt className="pointer-events-none absolute right-4 top-1/2 hidden h-[24rem] w-[24rem] -translate-y-1/2 opacity-80 mix-blend-overlay lg:block" />
          
          <div className="relative max-w-xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3.5 py-1 text-xs font-mono font-bold tracking-wide backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              READY FOR GLOBAL TRANSACTIONS
            </div>

            <h2 className="hero-title mt-4 text-[2.6rem] text-balance sm:text-6xl text-white leading-tight">
              Scale your business onchain in minutes.
            </h2>

            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/90">
              Create your workspace, deploy a high-converting catalog, and receive test USDC on Arc Testnet today.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to={start}
                className={`${btn} bg-ink text-white hover:bg-ink-2 hover:scale-105 shadow-xl`}
              >
                {user ? 'Go to your workspace' : 'Launch free workspace'}{' '}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <span className="font-mono text-xs text-white/80">
                ✓ Arc Testnet • No credit card required
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
