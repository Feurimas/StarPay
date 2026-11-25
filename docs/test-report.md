# StarPay test report

Date: 19 November 2026. Network: Arc Testnet, test funds only. Everything below was run in this project, and the numbers are exact.

## Summary

| Area | What ran | Result |
|---|---|---|
| Server tests | 51 tests in 5 files (accounts, organizations, commerce, AI, support, workflows, security audit, insights) | 51 passed |
| Live Arc Testnet payments | 29 checks with real transactions (`server/payment-e2e.ts`) | 29 passed |
| Full user journey in a real browser | 17 checks, phone-width screen, two browser wallets signing real transactions | 17 passed |
| Page sweep in a real browser | 30 pages at 390, 768 and 1280 px (90 loads): sideways scrolling, blank pages, console errors | 0 problems |
| Lint and typecheck | `bun run lint`, `bun run typecheck` | 0 errors |

## Phase 5 additions

- **Insights dashboard** (`/app/:workspace/insights`): total orders, total sales, pending and completed orders, verified USDC payments, pending payments, awaiting-payment orders, a verified-share ratio, a projected 30-day figure, a sales trend chart, orders per day, order status, product performance, customer activity and recent verified payments.
- **Every figure names its source.** Onchain verified means the server confirmed the payment on Arc Testnet. Offchain record means an order stored in StarPay. Estimate is a simple projection (average daily sales of the period times 30), not a forecast. New workspaces show zeros and empty states, never sample data.
- **Business reports:** CSV downloads for orders, payments and products (spreadsheet formulas in customer names are defused), a print layout, and an AI-written summary that is labeled as AI output.
- **Mobile:** charts draw at the real screen width, so labels stay readable on phones.

## Tests that prove it

- Insights figures match the stored records (orders, cancelled orders excluded from sales, verified payments counted only from verified payment rows).
- Another organization gets "not found" and a signed-out visitor gets "unauthorized" on insights and every report. Viewers can read them.
- A made-up transaction hash never marks an order paid (`audit.test.ts`).

## Bugs found and fixed during this phase

1. **Customers landed on an empty cart after placing an order.** After placing an order, the cart emptied and the checkout page sent the customer back to the cart instead of their order page. Found by the browser journey. Fixed.
2. **Endless refresh loop after a payment was confirmed.** The order page kept refreshing itself in a loop once payment succeeded. Found by the browser journey as a "maximum update depth" warning. Fixed.
3. **A genuine payment could be blocked.** Anyone holding an order link could submit a customer's transaction hash to a different order first, which stopped the real order from being verified. Each order now tracks its own transactions. Covered by a live test.
4. **Rate limits shared one bucket for everyone** behind the preview, and a forged forwarded-address header could dodge them. Addresses are now trusted only when `TRUST_PROXY=true`.
5. **Password-reset links were readable by anyone** who knew an email address in development mailbox mode. Each browser now sees only mail its own actions created.
6. **Two-column layouts overflowed sideways** on desktop for long product names. Fixed everywhere.
7. **The workflow canvas could not be scrolled by touch** on phones. Fixed.
8. **Errors showed a blank screen.** Added an error screen and a proper 404 page.

## Honest limits

- **AI provider:** never run against a real provider. The connection is tested only against a local stand-in server. It needs `AI_API_KEY` and `AI_MODEL`.
- **Email:** there is no email provider. Verification, reset and invitation mail appears in the in-app development mailbox.
- **Browser wallets:** the browser tests use a scripted wallet that signs with test keys. Real wallet extensions (MetaMask and others) were not exercised.
- **Vercel:** the site uploaded earlier is pages only. The server part has never run on Vercel.
- **Dependencies:** `bun audit` listed 38 advisories (17 high), mostly in wallet and build tooling. None were updated.
- **Security headers:** only API responses carry them. The web app has no content-security or framing headers.
- **Rate limits** are kept in memory, so they reset on restart and do not work across several servers.
- **Not covered:** refunds, third-party messaging channels (WhatsApp, Telegram), and any independent audit of the payment contract. Not production-ready until contracts, security, infrastructure and legal requirements are independently reviewed.
