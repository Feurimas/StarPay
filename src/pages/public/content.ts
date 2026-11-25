import { Bot, CreditCard, LineChart, MessageSquare, ShoppingBag, Workflow, type LucideIcon } from 'lucide-react'

export type ModuleStatus = 'Available now' | 'In development' | 'Planned'

export interface ProductModule {
  name: string
  icon: LucideIcon
  summary: string
  details: string[]
  status: ModuleStatus
  phase: string
}

/** Honest status per module: Phases 1 to 4 are live; Insights is still planned. */
export const MODULES: ProductModule[] = [
  {
    name: 'StarPay AI',
    icon: Bot,
    summary: 'A business assistant for support, sales and product questions.',
    details: ['Answers only from data the signed-in user may access', 'Business-specific knowledge base and instructions', 'AI text is always labeled apart from verified payment records', 'Never approves payments or touches wallet keys', 'Needs your own AI provider key to produce answers'],
    status: 'Available now',
    phase: 'Phase 4',
  },
  {
    name: 'StarPay Commerce',
    icon: ShoppingBag,
    summary: 'Products, storefronts, carts, checkout, orders and invoices.',
    details: ['Product catalog with inventory and discounts', 'Shareable storefront and product links', 'Customer profiles and order history', 'Mobile and desktop checkout'],
    status: 'Available now',
    phase: 'Phase 2',
  },
  {
    name: 'StarPay Pay',
    icon: CreditCard,
    summary: 'USDC payment requests and checkout on Arc, paid straight to the merchant.',
    details: ['Payments go from the payer to the merchant wallet, never through a StarPay wallet', 'Every payment is verified onchain by the server before an order is marked paid', 'Duplicate and replayed payments are rejected', 'Refunds are never automatic: a merchant sends one as a separate transfer from their own wallet (in-app refund tracking is not built yet)'],
    status: 'Available now',
    phase: 'Phase 3',
  },
  {
    name: 'StarPay Connect',
    icon: MessageSquare,
    summary: 'One inbox for customer conversations, profiles and notes.',
    details: ['Storefront conversations with assignment, tags and internal notes', 'AI-drafted replies that a person reviews', 'WhatsApp, Telegram and social channels are not connected: they need authorized provider credentials'],
    status: 'Available now',
    phase: 'Phase 4',
  },
  {
    name: 'StarPay Flow',
    icon: Workflow,
    summary: 'Visual automation for orders, payments and customer updates.',
    details: ['Visual editor with triggers, conditions and actions', 'Run history, manual runs and enable or disable controls', 'No step can send or approve a payment, so workflows cannot bypass wallet approval'],
    status: 'Available now',
    phase: 'Phase 4',
  },
  {
    name: 'StarPay Insights',
    icon: LineChart,
    summary: 'Sales, order and payment analytics from your real records.',
    details: ['Onchain-verified, offchain and estimated figures are labeled separately', 'No sample or invented numbers', 'Reports for orders, customers and products'],
    status: 'Planned',
    phase: 'Phase 5',
  },
]

export const FOUNDATION = [
  'Account sign up, sign in, email verification and password reset',
  'Business workspaces with isolated data per organization',
  'Team invitations and role-based permissions',
  'Business profile, regional formats and jurisdiction controls',
  'Audit log, privacy export and account deletion',
]
