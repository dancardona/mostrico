# Mostro Web — Technical specification

## 1. Product

**Working name:** Mostrico

**Purpose:** Provide a friendly Spanish-language browser interface for buying and selling Bitcoin P2P using a local installation of `mostro-cli`.

The application is a usability layer. `mostro-cli` remains responsible for Mostro/Nostr identity and protocol interaction.

### Why local-first

The Mostro CLI stores the user's identity locally and derives trade keys from its mnemonic/database. A hosted website that remotely controls a user's CLI would create unnecessary custody/security risks.

Therefore this MVP runs locally:

```text
Browser (127.0.0.1)
        |
        v
Next.js local server
        |
        v
Safe CLI adapter
        |
        v
mostro-cli
        |
        +--> Nostr relays / Mostro instance
        |
        +--> ~/.mcli/mcli.db (owned by mostro-cli only)
```

The web application MUST NOT open or parse `~/.mcli/mcli.db`.

---

## 2. Scope

### MVP — include

- CLI/config diagnostics
- Browse sell orders
- Fiat currency filter, default `COP`
- Order details
- Take sell order as buyer
- Fixed and range order support
- Provide Lightning invoice during take
- Add Lightning invoice after take
- Fetch Mostro DMs
- Buyer trade timeline
- Mark fiat as sent
- Rate seller
- Open dispute
- Create buy and sell maker orders
- Fixed or ranged fiat amounts and market or fixed-sats pricing
- Show a returned sell hold invoice once, without paying or persisting it
- Track locally created maker orders
- Cancel a pending maker order with explicit confirmation
- Release sats only after explicit confirmation that fiat was received
- Persist only non-sensitive local UI metadata for trades initiated through this app
- Responsive Spanish UI

### Explicitly out of scope

- Paying Lightning invoices
- Generating a Lightning wallet invoice
- Connecting directly to a bank/Nequi/Daviplata
- Automatically sending fiat
- Admin/solver commands
- `ADMIN_NSEC`
- Mnemonic display/import/export
- Reading/writing `~/.mcli/mcli.db`
- Remote multi-user hosting
- User accounts/passwords
- Cloud database
- Analytics/telemetry
- Arbitrary terminal access
- Arbitrary `mostro-cli` command execution

---

## 3. Current CLI contract

Target the installed `mostro-cli` and detect its version at runtime.

At the time this specification was prepared, the public project documents this buyer flow:

```bash
mostro-cli listorders -k sell -c cop
mostro-cli ordersinfo -o <uuid>
mostro-cli takesell -o <uuid> -i <lnbc...>
mostro-cli takesell -o <uuid> -a <fiat_amount> -i <lnbc...>
mostro-cli takesell -o <uuid> [-a <fiat_amount>]
mostro-cli addinvoice -o <uuid> -i <lnbc...>
mostro-cli getdm --since 30
mostro-cli fiatsent -o <uuid>
mostro-cli rate -o <uuid> -r 5
mostro-cli dispute -o <uuid>
mostro-cli neworder -k <buy|sell> -c <currency> -f <amount|range> -m <methods> -a <sats|0> -p <premium> -e <days> [-i <invoice-or-address>]
mostro-cli cancel -o <uuid>
mostro-cli release -o <uuid>
```

Configuration:

```env
MOSTRO_PUBKEY=<npub or hex of chosen Mostro instance>
RELAYS=wss://relay.example,wss://another.example
```

Do not bake a single Mostro node into application logic. Defaults may be supplied in `.env.local`, but configuration must remain replaceable.

### Compatibility strategy

Do not couple React components to CLI text.

```text
UI
  -> API routes
     -> MostroService
        -> MostroCliRunner
        -> parsers
```

Types returned to the UI are stable app-domain types even if CLI formatting changes.

---

## 4. Recommended stack and structure

Use:
- Next.js App Router
- TypeScript
- Node runtime for CLI API routes
- Tailwind
- shadcn/ui or similar accessible component set
- Zod
- Vitest
- Playwright

Suggested project tree:

```text
mostro-web/
├─ app/
│  ├─ page.tsx
│  ├─ setup/page.tsx
│  ├─ market/page.tsx
│  ├─ orders/[id]/page.tsx
│  ├─ trades/[id]/page.tsx
│  └─ api/
│     ├─ diagnostics/route.ts
│     ├─ orders/route.ts
│     ├─ orders/[id]/route.ts
│     ├─ trades/take-sell/route.ts
│     ├─ trades/add-invoice/route.ts
│     ├─ trades/[id]/messages/route.ts
│     ├─ trades/[id]/fiat-sent/route.ts
│     ├─ trades/[id]/rate/route.ts
│     └─ trades/[id]/dispute/route.ts
├─ components/
├─ lib/
│  ├─ mostro/
│  │  ├─ runner.ts
│  │  ├─ service.ts
│  │  ├─ commands.ts
│  │  ├─ parsers.ts
│  │  ├─ schemas.ts
│  │  ├─ redact.ts
│  │  └─ types.ts
│  └─ store/local-state.ts
├─ test/fixtures/cli/
├─ test/commands.test.ts
├─ test/parsers.test.ts
├─ test/redact.test.ts
├─ e2e/buy-flow.spec.ts
├─ data/.gitkeep
├─ .env.example
└─ README.md
```

---

## 5. Safe CLI runner

### Never do this

```ts
exec(`mostro-cli takesell -o ${orderId} -i ${invoice}`)
```

Never use `shell: true`, `eval`, or a frontend-supplied executable/command name.

### Correct pattern

```ts
spawn("mostro-cli", [
  "takesell",
  "-o", validatedOrderId,
  "-i", validatedInvoice
], {
  shell: false,
  env: safeEnv,
})
```

### Runner interface

```ts
interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface MostroCliRunner {
  run(args: readonly string[], options?: {
    timeoutMs?: number;
  }): Promise<RunResult>;
}
```

Responsibilities:
- fixed executable (`MOSTRO_CLI_PATH`, default `mostro-cli`)
- explicit args arrays
- `shell: false`
- timeout + child termination
- bounded stdout/stderr
- serialized queue/mutex
- sanitized logging
- typed error mapping

Recommended:
- normal timeout: 30 s
- network/read timeout: 45 s
- output bound: 1–2 MB
- never automatically retry mutating commands

### Environment

Construct it server-side. The browser must not submit arbitrary env vars.

Allowed Mostro-related vars:

```text
MOSTRO_PUBKEY
RELAYS
POW (optional)
```

Do not support `ADMIN_NSEC` in MVP.

---

## 6. Command builder

Keep all command construction in `lib/mostro/commands.ts`.

Suggested functions:

```ts
listOrdersCommand(input)
orderInfoCommand(orderId)
takeSellCommand(input)
addInvoiceCommand(input)
getDmCommand(sinceMinutes)
fiatSentCommand(orderId)
rateCommand(orderId, rating)
disputeCommand(orderId)
```

No API route may manually concatenate CLI arguments.

---

## 7. Validation

Use Zod for every external input.

### Order IDs

Canonical UUID only:

```ts
z.string().uuid()
```

### Currency

```ts
z.string().regex(/^[A-Z]{3}$/)
```

Default `COP`.

### Fiat amount

- positive
- finite
- no exponent notation from user input
- bounded string length
- honor decimals only if actual installed CLI accepts them

Use string/decimal-safe handling rather than JavaScript floating point for money calculations.

### Rating

Integer 1..5.

### Relays

Only `wss://` URLs.

### Mostro pubkey

Accept:
- `npub1...`
- exactly 64 hex chars

### Lightning invoice

Treat as sensitive application data.

At minimum recognize typical BOLT11 prefixes (`lnbc`, `lntb`, etc.). Prefer a maintained local decoder to display amount/network/expiry when possible.

Do not make a third-party HTTP request to validate the invoice.

If local decoding fails but the input looks potentially valid, the CLI remains the authoritative validator. Do not invent invoice information.

---

## 8. Domain types

The UI must consume typed objects, not terminal text.

```ts
type OrderKind = "sell" | "buy";
type OrderStatus = string;

interface MostroOrder {
  id: string;
  kind: OrderKind;
  currency: string;
  fiatAmount?: string;
  minFiatAmount?: string;
  maxFiatAmount?: string;
  sats?: number;
  premiumPct?: number;
  paymentMethods: string[];
  status?: OrderStatus;
  makerPubkey?: string;
  reputation?: {
    rating?: number;
    trades?: number;
  };
  rawFields?: Record<string, string>;
}

interface TradeMessage {
  id?: string;
  orderId?: string;
  type?: string;
  timestamp?: string;
  text: string;
  source: "mostro" | "counterparty" | "unknown";
}

type LocalTradeStep =
  | "taken"
  | "needs_invoice"
  | "waiting_for_lock"
  | "ready_for_fiat"
  | "fiat_marked_sent"
  | "waiting_release"
  | "completed"
  | "disputed"
  | "unknown";
```

Only populate fields supported by actual CLI output.

---

## 9. Parser strategy

### Preferred

If the installed CLI exposes machine-readable JSON/structured output, use it.

### Fallback for terminal text/tables

1. Capture real sanitized outputs from the installed version.
2. Strip ANSI server-side.
3. Parse headers by names where possible, not fixed character offsets.
4. Store fixtures in `test/fixtures/cli/`.
5. Test each parser.
6. If format is unknown, return `CLI_OUTPUT_UNRECOGNIZED`.
7. Never guess fiat/sats values when parsing is ambiguous.

This is especially important for payment instructions/messages.

---

## 10. API contract

Use a standard response envelope.

Success:

```json
{ "ok": true, "data": {} }
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "CLI_NOT_FOUND",
    "message": "No se encontró mostro-cli."
  }
}
```

### `GET /api/diagnostics`

Return:

```ts
{
  cliFound: boolean;
  cliVersion?: string;
  supported: boolean;
  mostroConfigured: boolean;
  relayCount: number;
  connection?: "ok" | "error" | "unknown";
  warnings: string[];
}
```

Never return mnemonic/private key/database content.

### `GET /api/orders?currency=COP`

Internally force `kind=sell` for the public market view.

### `POST /api/orders`

Creates a buy or sell maker order. Requires an explicit `confirmed: true` guard and accepts currency, fiat amount or range, payment methods, sats (`0` for market pricing), premium, expiration, and an optional invoice or Lightning Address for buy orders.

If a sell order returns a hold invoice, return it only in this response so the UI can display it once. Never persist or log the full invoice.

### `GET /api/orders/:id`

Uses `ordersinfo`.

### `POST /api/trades/take-sell`

```json
{
  "orderId": "uuid",
  "fiatAmount": "100000",
  "invoice": "lnbc...",
  "confirmed": true
}
```

`fiatAmount` and invoice may be optional depending on fixed/range/deferred-invoice flow. `confirmed` is mandatory.

### `POST /api/trades/add-invoice`

```json
{
  "orderId": "uuid",
  "invoice": "lnbc..."
}
```

### `GET /api/trades/:id/messages?since=30`

Runs `getdm` and safely associates messages.

**Critical:** if `getdm` returns messages for multiple trades and reliable order association is unavailable, never attach bank/payment instructions from another order to the current trade. Return ambiguous messages separately or require manual review.

### `POST /api/trades/:id/fiat-sent`

```json
{ "confirmedActualFiatTransfer": true }
```

Reject unless exactly true, then run `fiatsent`.

### `POST /api/trades/:id/rate`

```json
{ "rating": 5 }
```

### `POST /api/trades/:id/dispute`

```json
{ "confirmed": true }
```

### Maker-order routes

- `GET /api/my-orders/:id` returns non-sensitive local metadata and recent messages.
- `POST /api/my-orders/:id/cancel` requires explicit confirmation before running `cancel`.
- `POST /api/my-orders/:id/release` requires confirmation that fiat was actually received before running `release`.

---

## 11. UI flow

### `/setup`

Show:
- CLI installed yes/no
- CLI version
- Mostro public key configured yes/no
- relay count
- connectivity status
- “Probar conexión”

Never ask for mnemonic/nsec.

### `/market`

Title: **Comprar Bitcoin**

Explain that these are people selling sats.

Default:
- currency COP
- kind sell, fixed internally

Order cards/table should show only what is actually available:
- fiat amount/range
- sats
- premium
- payment methods
- status
- reputation if present

CTA: **Ver oferta**

### `/orders/new`

Create a buy or sell maker order with:
- currency and fixed/range fiat amount
- market price or fixed sats
- one to five payment methods
- premium and expiration
- optional invoice or Lightning Address for buy orders
- explicit publication confirmation

For sell orders, explain that Mostro may return a hold invoice and that Mostrico never pays it.

### `/my-orders/[id]`

Show locally persisted maker metadata, recent Mostro messages, and role-specific actions. Canceling and releasing require explicit confirmation. Releasing must state that the user has already received and verified the fiat payment.

### `/orders/[id]` — buying wizard

Step 1 — amount:
- fixed: display read-only
- range: input fiat amount and validate min/max

Step 2 — invoice:

Copy:
> Esta factura Lightning es donde recibirás los sats cuando el vendedor libere la operación.

Actions:
- paste invoice
- “Agregar invoice después”

Step 3 — review:
- order ID
- fiat amount
- sats if known
- payment method
- premium if known
- invoice yes/no

Warn:
> Tomar la oferta inicia la operación, pero no envía dinero fiat.

CTA: **Tomar oferta**

### `/trades/[id]`

Display:
- trade summary
- timeline
- current evidence-backed state
- recent Mostro messages prominently
- manual refresh
- polling every ~15 seconds while tab visible
- add invoice action if needed
- fiat sent action
- dispute
- rating when appropriate

Suggested timeline:
1. Oferta tomada
2. Invoice Lightning agregada
3. Operación lista / sats asegurados — only if confirmed by Mostro output
4. Pago fiat
5. Esperando liberación
6. Operación completada

If readiness cannot be determined safely:
> Revisa los mensajes de Mostro antes de transferir fiat.

### Fiat sent confirmation

Title:
> ¿Ya hiciste la transferencia?

Text:
> Este botón no envía dinero. Solo notifica a Mostro que ya pagaste al vendedor. Úsalo únicamente después de confirmar el método acordado y completar la transferencia fuera de esta aplicación.

Checkbox:
> Confirmo que ya envié el pago fiat.

CTA:
> Marcar fiat como enviado

Disabled until checked.

### Dispute

Secondary/destructive action:
> Abrir disputa

Require explicit confirmation and explain that a solver may need to review the case.

---

## 12. Local state

Mostro/CLI remains protocol source of truth.

Persist only non-sensitive UI metadata for trades initiated in this app, e.g.:

```json
{
  "trades": {
    "<uuid>": {
      "createdAt": "...",
      "currency": "COP",
      "selectedFiatAmount": "100000",
      "lastKnownStep": "fiat_marked_sent"
    }
  }
}
```

Use atomic local writes under `data/`.

Add state files to `.gitignore`.

Never persist:
- mnemonic
- nsec
- private trade keys
- raw CLI DB
- full bank account details
- full invoice after completion

---

## 13. Logging/redaction

Log only what is useful:
- action name
- order ID
- duration
- exit code
- sanitized error code

Redact:
- invoices (e.g. `lnbc1abcd…[redacted]`)
- `nsec1...`
- mnemonic-like sequences
- private hex keys
- raw DMs at info level

No remote logging.

---

## 14. Concurrency and retries

Use a server-side queue/mutex.

- market refresh: manual + optional 30 s
- trade messages: 15 s while tab visible
- pause polling when hidden
- allow manual refresh

Never automatically retry mutating actions:
- `takesell`
- `addinvoice`
- `fiatsent`
- `rate`
- `dispute`

A timeout can be ambiguous: the CLI action may have reached Mostro even if the local process did not receive the final response.

Display:
> No podemos confirmar si Mostro recibió la acción. Actualiza el estado antes de intentarlo de nuevo.

---

## 15. Errors

Map at least:

- `CLI_NOT_FOUND`
- `CLI_VERSION_UNSUPPORTED`
- `MOSTRO_NOT_CONFIGURED`
- `RELAYS_NOT_CONFIGURED`
- `CLI_TIMEOUT`
- `CLI_EXIT_ERROR`
- `CLI_OUTPUT_UNRECOGNIZED`
- `INVALID_ORDER_ID`
- `INVALID_AMOUNT`
- `INVALID_INVOICE`
- `ORDER_NOT_FOUND`
- `ORDER_NOT_AVAILABLE`
- `NETWORK_ERROR`
- `MOSTRO_ERROR`

UI messages in Spanish. Technical details accordion may exist, but sanitized only.

---

## 16. Tests

### Command construction/security

Reject before runner invocation:

```text
uuid; rm -rf /
$(whoami)
"`touch /tmp/x`"
```

Assert exact args arrays.

### Parser fixtures

Use real sanitized CLI output for:
- list orders
- empty orderbook
- order detail
- take success
- add invoice success
- getdm with relevant and unrelated messages
- fiatsent success
- rate success
- dispute success
- stderr/error formats

### Redaction

Test:
- BOLT11 invoice
- nsec
- mnemonic-like content

### E2E with mocked adapter

1. healthy setup
2. COP market
3. choose sell order
4. range amount = 100,000 COP
5. paste invoice
6. confirmation
7. trade page
8. ready message
9. click fiat sent
10. confirmation checkbox blocks accidental action
11. mocked completion
12. rate 5

No real funds/network in automated tests.

---

## 17. README

Must include:

### Requirements
- Node.js LTS
- installed `mostro-cli`
- Lightning wallet
- Mostro instance + relay env config

### Install

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

### Security notes

Clearly state:
- app is local-only
- app never needs mnemonic
- do not expose server to LAN/internet
- back up Mostro CLI identity separately following official docs
- verify payment instructions outside the app
- `fiatsent` is a declaration, not a bank transfer

### Troubleshooting

```bash
mostro-cli --version
mostro-cli --help
mostro-cli listorders -k sell -c cop
```

---

## 18. Visual direction

Clean fintech rather than “crypto casino”.

- neutral background
- restrained Bitcoin/orange accent
- clear COP vs sats hierarchy
- accessible contrast
- responsive mobile layout
- large primary actions
- warnings/destructive actions visually distinct
- no excessive gradients/tickers/noise

Spanish first, but keep strings structured so i18n can be added later.

---

## 19. Future phases — do not implement now

- taking public buy orders as a seller
- richer maker-order status synchronization
- direct user chat (`senddm`, `getdmuser`)
- Mostro community/instance discovery
- Lightning Address
- wallet integration
- QR invoice scanning
- Tauri/Electron packaging
- direct Mostro protocol integration without shelling out to CLI
- machine-readable event stream if CLI exposes one

---

## 20. References

Verify syntax against the installed binary before final implementation.

- Mostro CLI: https://github.com/MostroP2P/mostro-cli
- Spanish CLI docs: https://mostro.network/docs-spanish/mostro-cli.html
- Mostro docs: https://mostro.network/docs-spanish/index.html

The installed `mostro-cli --help` and actual behavior are the final compatibility authority.
