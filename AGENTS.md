# StarPay

> Built with Arc Studio - money-powered apps in minutes

Project memory for agents and developers.

## What this app does

Global commerce and business platform. Workspaces with roles, products, storefront, orders, invoices, customers, and USDC payments on Arc Testnet paid directly from the customer's wallet to the merchant's wallet.

## Build phases

1. Foundation: auth, workspaces, roles, dashboard, public pages (done)
2. Commerce: products, stock, discounts, storefront, cart, checkout, orders, customers, invoices (done)
3. Arc payments: payment contract, wallet connect, payment requests, server verification, history (done, live-tested on Arc Testnet)
4. AI and automation (not started)
5. Analytics and polish (not started)

## Architecture

- `src/` React app. `src/pages/public` marketing, `src/pages/store` public storefront and payer pages, `src/pages/app` signed-in pages.
- `server/` Bun API (`server/index.ts` routes). Every workspace route goes through `requireMember` in `server/context.ts` (organization isolation). Roles and permissions live in `src/lib/permissions.ts` and are enforced on the server.
- Postgres schema is in `server/schema.ts` (idempotent, applied on API start). Money is stored as integer USDC base units (6 decimals) and converted only with `@/onchain-money`.
- Payment verification: `server/chain.ts` (chain reads, event decoding) and `server/payments.ts` (idempotent apply, background sweeper). Orders become paid ONLY there, after the server verifies the transaction onchain. No endpoint accepts a "mark as paid".
- Secrets in URLs: invite, verify and reset tokens travel in the `#fragment`. Order and invoice links use unguessable opaque ids.

## Arc facts (verified against official docs and the live chain)

- Arc Testnet chain id 5042002, explorer https://explorer.testnet.arc.io, RPC https://rpc.testnet.arc.io (all read from `@/onchain-facts`).
- ERC-20 USDC interface `0x3600000000000000000000000000000000000000`, 6 decimals (read onchain: name USDC, symbol USDC). Native gas is the same USDC at 18 decimals; never show or sum both.
- A single ERC-20 transfer emits two Transfer logs (the ERC-20 contract at 6 decimals and the native system emitter at 18). Verification reads only the ERC-20 log.
- Finality is deterministic: a transaction in a committed block is final. The server still confirms the block hash is canonical on the node it asked.

## Deployed contracts (Arc Testnet)

- StarPayPayments: `0x47aa0521211cd144a56ba2910a732241efcdd512` (deployed in block 72818147, constructor arg: USDC `0x3600000000000000000000000000000000000000`). Immutable, no owner, never holds funds. Metadata in `contracts/contract-metadata/StarPayPayments.json`.
- Payment ids commit to (invoiceRef, merchant, amount), so a griefer paying different terms cannot block the real invoice.

## Rules

- Never fabricate balances, transactions or payment success. Never add a manual "mark paid".
- Never store keys or seed phrases. Test wallets for the live payment check live only in `/tmp`.
- No exchange, lending or yield features. No platform custody wallet.
- Mainnet is out of scope until independent review. Do not deploy to mainnet from Arc Studio.

## To run

```bash
bun install
bun run api
bun run dev
```

## Phase 4 notes (AI, support, workflows)
- AI goes through `server/ai.ts` (OpenAI-compatible Chat Completions, env `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL`). The model gets no tools. Prompts are built from workspace-scoped retrieval (`server/knowledge.ts`) and aggregate stats only, never customer emails.
- Customer-facing AI replies are opt-in (`ai_settings.auto_reply`), use public knowledge and active products only, and are stored with sender `ai`.
- Workflow engine: `server/workflowEngine.ts`. The set of step types is a whitelist; there is deliberately no step that moves funds, approves, refunds or marks an order paid. Events are emitted from checkout, order status changes and verified payments.
- Postgres JSON: always write `${JSON.stringify(x)}::text::jsonb`. Plain `::jsonb` stores a JSON string scalar with Bun SQL. Arrays: use `sql.array(values, 'TEXT')`.
- Tests: `bun test server` (uses a local OpenAI-compatible stub to inspect what is sent to the provider).

## Design system (warm canvas, orange accent)
- Tokens live in `src/index.css` (`--canvas`, `--ink`, `--accent`, `--brand`) and `tailwind.config.js`. `bg-accent` is the bright orange fill and carries dark text; `text-brand` / `bg-brand` is the darker orange for text and white-on-orange.
- Fonts: Hanken Grotesk (`.display`, `.hero-title`), DM Sans (body), Newsreader (`.serif` lead text), JetBrains Mono (`.eyebrow`, telemetry labels).
- Marketing artwork is generated SVG in `src/components/art.tsx`. It carries no data. Never add fake team photos, customer logos or invented statistics.
- After changing `tailwind.config.js`, restart the dev server: it can keep serving a stale utility stylesheet.
