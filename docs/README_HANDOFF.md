# Handoff package for Codex

Give Codex this whole folder or the ZIP.

Recommended first prompt:

> Implement the application described in `CODEX_PROMPT.md` and `SPEC.md`. Start with the CLI adapter, validation, command-construction tests and diagnostics. Do not weaken any security requirements. Before writing parsers, inspect the actual output of my installed `mostro-cli` and create sanitized fixtures. Include the buyer flow and guarded buy/sell maker-order creation.

Files:
- `CODEX_PROMPT.md` — direct implementation instructions
- `SPEC.md` — detailed product, architecture, API, security and UX specification
- `.env.example` — safe configuration template

The design intentionally keeps Mostro identity management inside `mostro-cli`; the web app must never read the mnemonic/database.
