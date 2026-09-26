# Graph Report - mostrico  (2026-09-09)

## Corpus Check
- 98 files · ~93,747 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 578 nodes · 1415 edges · 26 communities (19 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.81)
- Token cost: 187,903 input · 33,158 output

## Community Hubs (Navigation)
- CLI Command Builder & Bond Cache
- Next.js API Route Handlers
- Order & Trade Page Components
- Safe CLI Runner & Redaction
- Project Specs, Docs & CI
- Nostr Chat Transport
- Market Offers Browser
- CLI Output Parsers
- Package Manifest
- TypeScript Config
- Dev Dependencies
- Runtime Dependencies
- CLI Error Presentation
- App Layout & Navigation
- Playwright E2E Specs
- NPM Scripts
- Trade Wizard E2E Test
- Mostrico Brand & Logo
- Apple Touch Icon Art
- App Icon Branding
- Tailwind Config
- Next Env Typings

## God Nodes (most connected - your core abstractions)
1. `MostroService` - 69 edges
2. `ok()` - 38 edges
3. `fail()` - 38 edges
4. `AppError` - 27 edges
5. `formatNumber()` - 20 edges
6. `upsertTrade()` - 16 edges
7. `compilerOptions` - 16 edges
8. `vitest` - 15 edges
9. `MostroCliRunner` - 14 edges
10. `lucide-react` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules` --conceptually_related_to--> `Mostro Web Technical Specification`  [AMBIGUOUS]
  AGENTS.md → docs/SPEC.md
- `Mostrico Security Rules (local-only, no secrets to browser)` --semantically_similar_to--> `Local-First Architecture`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → docs/SPEC.md
- `CLI Fixture: Empty Orderbook` --references--> `Parser Strategy (prefer JSON, fixture-based fallback)`  [INFERRED]
  test/fixtures/cli/empty-orderbook.txt → docs/SPEC.md
- `CLI Fixture: listorders Column Output` --references--> `Parser Strategy (prefer JSON, fixture-based fallback)`  [INFERRED]
  test/fixtures/cli/listorders.txt → docs/SPEC.md
- `CLI Fixture: listorders Table Output` --references--> `Parser Strategy (prefer JSON, fixture-based fallback)`  [INFERRED]
  test/fixtures/cli/listorders-table.txt → docs/SPEC.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **GitHub Actions verification pipeline (lint/test/build, E2E, dependency review)** — _github_workflows_ci_ci_workflow, _github_workflows_e2e_e2e_workflow, _github_workflows_dependency_review_dependency_review_workflow, contributing_contribution_guide [EXTRACTED 0.90]
- **Safe CLI invocation pattern (runner, command builder, redaction, serialized queue)** — docs_spec_safe_cli_runner, docs_spec_command_builder, docs_spec_redaction, docs_spec_concurrency_and_retries [EXTRACTED 0.90]
- **Cloud multi-user isolation (identity separation, web sessions, single writer per identity, architecture alternatives)** — docs_cloud_multiuser_design_identity_separation, docs_cloud_multiuser_design_web_sessions, docs_cloud_multiuser_design_single_writer_per_identity, docs_cloud_multiuser_design_architecture_alternatives [EXTRACTED 0.85]

## Communities (26 total, 3 thin omitted)

### Community 0 - "CLI Command Builder & Bond Cache"
Cohesion: 0.07
Nodes (54): BondEntry, cacheBondInvoice(), cacheScope, clearCachedBondInvoice(), getCachedBondInvoice(), addInvoiceCommand(), cancelOrderCommand(), CommandSpec (+46 more)

### Community 1 - "Next.js API Route Handlers"
Cohesion: 0.06
Nodes (69): GET(), runtime, POST(), runtime, POST(), runtime, GET(), runtime (+61 more)

### Community 2 - "Order & Trade Page Components"
Cohesion: 0.06
Nodes (52): LocalOrder, MyOrderPage(), statusLabel(), OrderPage(), conditionFields, fieldMessages, NewOrderPage(), navigate() (+44 more)

### Community 3 - "Safe CLI Runner & Redaction"
Cohesion: 0.06
Nodes (41): CacheEntry, cacheOrders(), cacheScope, clearOrderCache(), redactSensitive(), shorten(), boundedAppend(), createSafeEnv() (+33 more)

### Community 4 - "Project Specs, Docs & CI"
Cohesion: 0.07
Nodes (39): CI Workflow (lint, test, build), Dependency Review Workflow, E2E Playwright Buyer Flow Workflow, Next.js Agent Rules, Claude Project Instructions, Mostrico Contribution Guide, Mostrico Security Rules (local-only, no secrets to browser), Cloud Architecture Alternatives A-H (+31 more)

### Community 5 - "Nostr Chat Transport"
Cohesion: 0.13
Nodes (18): ChatResponse, bytesFromHex(), ChatKeys, ChatTransport, ChatTransportInput, createChatEnvelope(), deriveChatKeys(), deriveScalar() (+10 more)

### Community 6 - "Market Offers Browser"
Cohesion: 0.15
Nodes (18): intents, MarketPage(), OfferRow(), conditions, offers, createdTime(), fiatBounds(), MarketIntent (+10 more)

### Community 7 - "CLI Output Parsers"
Cohesion: 0.18
Nodes (21): CliTradeEvent, normalizeKey(), orderFromFields(), parseChatMessages(), parseCliTradeEvents(), parseJsonOrders(), parseMethods(), parseNewOrderResult() (+13 more)

### Community 8 - "Package Manifest"
Cohesion: 0.10
Nodes (20): name, private, version, autoprefixer, clsx, eslint, eslint-config-next, @noble/curves (+12 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "Dev Dependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, eslint-config-next, jsqr, @playwright/test, pngjs, postcss (+8 more)

### Community 11 - "Runtime Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, clsx, lucide-react, next, @noble/curves, @noble/hashes, nostr-tools, qrcode.react (+5 more)

### Community 12 - "CLI Error Presentation"
Cohesion: 0.25
Nodes (9): asAppError(), authorizationReasons, cantDoReasons, compact(), ErrorPresentation, parseCliError(), unavailableActionReasons, validationReasons (+1 more)

### Community 13 - "App Layout & Navigation"
Cohesion: 0.25
Nodes (5): metadata, AppNav(), destinations, nextConfig, next

### Community 15 - "NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, test:e2e

### Community 16 - "Trade Wizard E2E Test"
Cohesion: 0.40
Nodes (3): bond, jsqr, pngjs

### Community 17 - "Mostrico Brand & Logo"
Cohesion: 0.50
Nodes (5): Brand Color Palette (Green, Orange, Dark Navy), Green Furry Monster Mascot, Mostrico Brand Identity, Mostrico Logo, Orange Lightning Bolt Motif

### Community 18 - "Apple Touch Icon Art"
Cohesion: 1.00
Nodes (3): Mostrico Apple Touch Icon, Green Monster Mascot Logo, Mostrico Brand Identity

### Community 19 - "App Icon Branding"
Cohesion: 0.67
Nodes (3): Mostrico App Branding, Orange Lightning Bolt Motif, Mostrico Monster Mascot Icon

## Ambiguous Edges - Review These
- `Next.js Agent Rules` → `Mostro Web Technical Specification`  [AMBIGUOUS]
  AGENTS.md · relation: conceptually_related_to

## Knowledge Gaps
- **159 isolated node(s):** `runtime`, `runtime`, `runtime`, `runtime`, `runtime` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 207 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Next.js Agent Rules` and `Mostro Web Technical Specification`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Safe CLI Runner & Redaction` to `CLI Command Builder & Bond Cache`, `Order & Trade Page Components`, `Nostr Chat Transport`, `Market Offers Browser`, `CLI Output Parsers`, `Package Manifest`, `CLI Error Presentation`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `MostroService` connect `Next.js API Route Handlers` to `CLI Command Builder & Bond Cache`, `Safe CLI Runner & Redaction`, `Nostr Chat Transport`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `zod` connect `Next.js API Route Handlers` to `CLI Command Builder & Bond Cache`, `Package Manifest`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `runtime`, `runtime`, `runtime` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CLI Command Builder & Bond Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.06617826617826618 - nodes in this community are weakly interconnected._
- **Should `Next.js API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.06165099268547544 - nodes in this community are weakly interconnected._