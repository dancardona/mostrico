# Codex implementation brief — Mostrico

You are implementing a local-first web UI on top of an already-installed `mostro-cli`.

Read `SPEC.md` completely before writing code. Treat it as the source of truth.

## Goal

Build a polished local web application that makes buying and selling Bitcoin P2P through Mostro easier for a non-CLI user.

The current scope includes the original buyer flow plus maker-order creation:
- Browse open `sell` orders.
- Default market to `COP`.
- Inspect an order.
- Take a sell order.
- Paste/add a Lightning BOLT11 invoice.
- Follow trade messages/status.
- Mark fiat as sent.
- Rate seller.
- Open a dispute if necessary.
- Publish buy and sell maker orders.
- Show a sell hold invoice for manual payment without storing it.
- Track, cancel and release locally created maker orders with explicit guards.

Do **not** implement automatic Lightning payments, bank transfers, admin/solver functionality, mnemonic import/export, or direct database access.

## Architecture constraint

This is a local web app, not a hosted SaaS.

The browser must NEVER execute the CLI directly. A Node.js server running locally wraps `mostro-cli`.

Recommended stack:
- Next.js (App Router) + TypeScript
- Node runtime for all API routes that invoke the CLI
- Tailwind CSS
- shadcn/ui or equivalent accessible components
- Zod for all API input validation
- Vitest for unit tests
- Playwright for the critical buyer-flow UI test

Run only on `127.0.0.1` by default.

## Critical security requirements

1. Never expose mnemonic/private keys/`nsec`/contents of `~/.mcli/mcli.db` to the browser.
2. Do not read the CLI database in the MVP.
3. Never use `exec`, `eval`, `shell: true`, string-concatenated shell commands, or user-provided command names.
4. Invoke the binary with `spawn`/`execFile` and a fixed executable + explicit argument array.
5. Maintain an explicit allowlist of supported Mostro actions.
6. Validate UUIDs, fiat amounts, ratings, relays, Mostro pubkeys and invoice input.
7. Never log full invoices at info level. Redact them.
8. Never render raw CLI output as HTML.
9. Queue CLI calls so overlapping commands cannot compete for the same local identity state.
10. Actions `take sell`, `fiat sent`, and `dispute` require explicit confirmation in the UI.
11. `fiatsent` must require a checkbox equivalent to: “Confirmo que ya envié el pago fiat”.
12. Never automate the fiat bank transfer.
13. Do not add analytics, telemetry, remote logging, or third-party error reporting in the MVP.

## Important implementation instruction

Do not assume the exact textual output format of `mostro-cli`.

At startup/diagnostics:
- run `mostro-cli --version`
- run help for commands used by this app
- expose a sanitized diagnostics result

Before finalizing parsers, inspect the real output from the installed CLI. Keep the CLI adapter isolated so parser changes do not affect UI code.

If the CLI offers structured/JSON output in the installed version, prefer it. Otherwise implement deterministic parsers with fixture-based tests.

## Required commands

```bash
mostro-cli listorders -k sell -c cop
mostro-cli ordersinfo -o <order-id>
mostro-cli takesell -o <order-id> [-a <fiat-amount>] [-i <invoice>]
mostro-cli addinvoice -o <order-id> -i <invoice>
mostro-cli getdm --since <minutes>
mostro-cli fiatsent -o <order-id>
mostro-cli rate -o <order-id> -r <1-5>
mostro-cli dispute -o <order-id>
mostro-cli neworder -k <buy|sell> -c <currency> -f <amount|range> -m <methods> -a <sats|0> -p <premium> -e <days> [-i <invoice-or-address>]
mostro-cli cancel -o <order-id>
mostro-cli release -o <order-id>
```

All commands inherit server environment including:

```env
MOSTRO_PUBKEY=
RELAYS=
```

## Required screens

- `/setup`: CLI/version/config/connectivity diagnostics.
- `/market`: browse `sell` orders, default COP.
- `/orders/[id]`: detail + take-order wizard.
- `/trades/[id]`: timeline, messages, invoice, fiat-sent, rating, dispute.
- `/orders/new`: publish a buy or sell maker order.
- `/my-orders/[id]`: maker-order summary, messages and guarded actions.

## Product wording

Use Spanish UI by default.

Be explicit:
- “Comprar BTC” means taking a `sell` order.
- The invoice is the Lightning invoice where the user receives sats.
- `fiatsent` does NOT send money; it only tells Mostro the fiat was already sent.
- Never instruct the user to send fiat merely because an order exists. Show latest trade state/messages first.

## Definition of done

1. `npm install && npm run dev` starts locally.
2. Setup diagnoses missing CLI/config clearly.
3. Market lists COP sell orders through the actual CLI.
4. Order detail works.
5. User can take fixed/range sell orders with or without invoice.
6. User can add invoice later.
7. Trade view refreshes Mostro DMs.
8. `fiatsent` has a strong confirmation guard.
9. Rating and dispute work.
10. No shell injection path exists.
11. No private key/mnemonic/database content is sent to frontend.
12. Unit tests cover command construction + parser fixtures.
13. Playwright covers buyer wizard with mocked CLI adapter.
14. README contains setup and security notes.
15. `.env.example` contains no secrets.
16. User can publish buy and sell maker orders with explicit confirmation.
17. Sell hold invoices are shown once, never paid or persisted by the app.

Start by implementing the CLI adapter, validation, tests and diagnostics before building the main UI.
