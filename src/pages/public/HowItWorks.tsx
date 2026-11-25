import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui'
import { PublicHero } from '@/components/PublicHero'

const STEPS = [
  { title: 'Create a workspace', text: 'Sign up, create your business workspace and invite your team with the right roles.' },
  { title: 'Add products and a storefront', text: 'Build your catalog and share storefront or product links with customers.' },
  { title: 'Customer pays in USDC', text: 'At checkout the customer connects a compatible wallet and approves a USDC payment on Arc. The funds move directly to your wallet.' },
  { title: 'StarPay verifies the payment', text: 'The server reads the chain itself and checks the network, USDC asset, recipient, amount, order reference and confirmation before an order is marked paid. A pending transaction stays pending.' },
  { title: 'Run the rest of your business', text: 'Answer customers from one inbox, let an AI agent draft replies from your knowledge base, and automate follow-ups with workflows that cannot touch money. ' },
]

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <PublicHero eyebrow="How it works" title="From sign up to paid." lead="What StarPay does, and what it never does with your money." />
      <ol className="relative space-y-4 pl-8 sm:pl-12">
        <span className="absolute bottom-3 left-[11px] top-3 border-l border-dashed border-ink/50 sm:left-[19px]" aria-hidden />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <span className="absolute -left-8 top-6 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-accent font-mono text-[10px] font-semibold text-ink ring-1 ring-ink sm:-left-12 sm:h-10 sm:w-10 sm:text-sm">{i + 1}</span>
            <h2 className="display text-xl font-bold">{s.title}</h2>
            <p className="mt-1.5 text-[15px] text-ink-2 text-pretty">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 space-y-3">
        <Alert tone="info">StarPay does not hold customer funds, convert USDC into local currency, or collect private keys or seed phrases.</Alert>
        <Alert tone="warning">Everything runs on Arc Testnet with test funds only. Do not treat StarPay as production-ready.</Alert>
      </div>
      <Link to="/signup" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-ink hover:bg-[#ff6e36]">
        Create your workspace <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
