import type { ReactNode } from 'react'
import { PublicHero } from '@/components/PublicHero'

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    body: (
      <>
        <p>Create an account, verify your email, then create a business workspace. Each workspace has its own members, settings and data.</p>
        <p>One account can belong to several workspaces. Use the switcher at the top of the sidebar to move between them.</p>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Roles and permissions',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li><strong>Owner</strong>: full control, including deleting the workspace and assigning owners.</li>
        <li><strong>Admin</strong>: manages settings and team members, but cannot grant owner or admin.</li>
        <li><strong>Manager</strong>: manages commerce data such as products, orders and invoices.</li>
        <li><strong>Support</strong>: handles customer conversations.</li>
        <li><strong>Viewer</strong>: read-only.</li>
      </ul>
    ),
  },
  {
    id: 'payments',
    title: 'USDC payments on Arc',
    body: (
      <>
        <p>Payments are designed to go from the customer wallet to the merchant wallet, through a minimal payment contract that records which invoice was paid. StarPay does not hold funds.</p>
        <p>An order is marked paid only after the server verifies the transaction onchain. A pending transaction stays pending. This is being built in Phase 3 and runs on Arc Testnet with test funds only.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security and privacy',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Passwords are hashed. Sessions use secure, HTTP-only cookies.</li>
        <li>Every record belongs to one workspace, and other organizations cannot read it.</li>
        <li>StarPay never asks for private keys or seed phrases.</li>
        <li>Private customer data stays offchain. Only payment references are written to the blockchain.</li>
        <li>You can download your data or delete your account from the Account page.</li>
      </ul>
    ),
  },
  {
    id: 'jurisdictions',
    title: 'Jurisdictions and compliance',
    body: (
      <>
        <p>StarPay checks the country of each business workspace against a restricted-jurisdiction list. The current list is a starter list and needs legal review before real use.</p>
        <p>StarPay does not help bypass sanctions, geographic restrictions or identity verification. You are responsible for following the laws that apply to your business. StarPay is not a bank, exchange, money transmitter or regulated financial institution.</p>
      </>
    ),
  },
  {
    id: 'limitations',
    title: 'Current limitations',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Arc Testnet only. Not production-ready until contracts, security, infrastructure and legal requirements are independently reviewed.</li>
        <li>No email provider is connected yet. In development, emails appear in an in-app development mailbox.</li>
        <li>Commerce, Pay, AI, Connect, Flow and Insights are being built in phases.</li>
        <li>WhatsApp, Telegram and social channels require provider authorization and are not connected.</li>
      </ul>
    ),
  },
]

export default function Docs() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Documentation sections" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow mb-2">On this page</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:block lg:space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block py-1.5 text-sm font-medium text-muted hover:text-ink">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <PublicHero eyebrow="Documentation" title="How StarPay works." lead="What is live today, what is still being built, and where the limits are." />
        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-6">
              <h2 className="display text-2xl font-bold">{s.title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2 text-pretty">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
