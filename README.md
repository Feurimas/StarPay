# StarPay

A global commerce and business platform with USDC payments on Arc. Each business gets a private workspace for its team, a product catalog, a public storefront with cart and checkout, customers, orders and invoices, and customers pay in USDC from their own wallet straight to the merchant's wallet.

Built with [Arc Studio](https://studio.arc.io)

Status: all five phases are built (accounts and workspaces, commerce, Arc USDC payments, AI assistant, customer inbox, workflow automation, and the Insights analytics dashboard). Arc Testnet and test funds only. Not production-ready: contracts, security, infrastructure and legal requirements still need independent review.

## What you can do

- Create an account, a business workspace and invite teammates with roles
- Manage products, stock, discounts and a public storefront
- Take orders through a shareable store link, issue invoices and manage customers
- Set a payout wallet and receive USDC payments on Arc Testnet
- See every payment with its status and a link to the Arc explorer
- Keep a knowledge base and ask an AI assistant about your business (needs your own AI provider key)
- Answer customers from a shared inbox, with AI-drafted replies a person reviews
- Build visual workflows that notify the team, invoice and update fulfilment. Workflows cannot send or approve payments
- Follow sales, orders, verified USDC payments, products and customers on an Insights dashboard. Every figure says whether it is onchain verified, an offchain record or an estimate
- Download orders, payments and products as CSV files, and print a business report

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS, React Router
- Bun API server with Postgres
- wagmi, viem and ConnectKit for wallets
- Solidity and Foundry for the payment contract

## Development

Prerequisites: Bun, Docker (for Postgres), Foundry (for contract tests).

```bash
bun install
docker run -d --name postgres --restart unless-stopped -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=starpay -v pgdata:/var/lib/postgresql -p 5432:5432 postgres:18-alpine
bun run api     # API server on port 3001
bun run dev     # web app on port 5173 (proxies /api to the API server)
```

Other commands:

- `bun run test:api` runs the API tests (needs Postgres)
- `bun run contracts:test` runs the contract tests
- `bun run server/payment-e2e.ts` runs live Arc Testnet payment checks (needs a funded test wallet file; see the script header)
- `bun run check` runs lint and typecheck

### Environment variables

- `DATABASE_URL`: Postgres connection string
- `API_PORT`: API server port (default 3001)
- `EMAIL_MODE`: `dev` shows verification, reset and invitation emails in an in-app development mailbox because no email provider is connected. Never run with `dev` in production.
- `DB_POOL_MAX`, `DB_PREPARE`: connection pool size (keep it small on serverless) and a switch to disable prepared statements for transaction-mode poolers
- `TRUST_PROXY`: set to `true` only behind a proxy you control (Vercel is one); it makes rate limits use the proxy-supplied client address
- `CRON_SECRET`: secret for the daily job at `/api/cron`
- `AI_API_KEY`, `AI_MODEL`: credentials and model id for any OpenAI-compatible AI provider. Without them the AI features say they are not connected and everything else works.
- `AI_BASE_URL`: optional provider URL (default `https://api.openai.com/v1`)
- `VITE_PAYMENT_ROUTER_ADDRESS`: address of the deployed StarPay payment contract on Arc Testnet
- `VITE_PAYMENT_ROUTER_DEPLOY_BLOCK`: block where that contract was deployed
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional outside Arc Studio. When absent the server uses the public Arc Testnet RPC.
- `RPC_URL_Arc_Testnet`: optional RPC URL override for the server

## Deploy to Vercel

The web app builds to static files and the API runs as one Vercel Function (`api/[...path].ts`) on the Bun runtime.

1. Create a hosted Postgres database (any provider) and copy its connection string. Use the pooled URL.
2. Import this repository in Vercel. The build settings come from `vercel.json`.
3. Add the variables from `.env.example` under Settings, Environment Variables. At minimum: `DATABASE_URL`, `DB_POOL_MAX=3`, `TRUST_PROXY=true`, `EMAIL_MODE=dev`, `VITE_PAYMENT_ROUTER_ADDRESS` and `VITE_PAYMENT_ROUTER_DEPLOY_BLOCK`.
4. Deploy. Tables are created on the first API request.

Things to know:

- Arc Testnet and test funds only. Do not treat the deployment as production-ready.
- No email provider is connected, so verification, reset and invitation emails appear in the in-app development mailbox.
- Rate limits are kept in memory per function instance, so they are weaker on serverless than on one server.
- Unfinished payments are re-checked on API traffic and once a day by the cron job. On the free plan, daily is the most often Vercel runs cron.
