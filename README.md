<div align="center"><a name="readme-top"></a>

<img src="public/logo/readme-hero.webp" alt="El Taxinator" width="480">

<br>

# El Taxinator — Self-hosted back office for Canary Islands businesses

</div>

> **Note:** This project is a fork of [Taxinator by vas3k](https://github.com/vas3k/Taxinator). We are grateful to the original creators for building the foundation — their work on AI-powered receipt scanning, transaction management, and the overall architecture made this fork possible. El Taxinator takes the project in a different direction, focusing specifically on the Canary Islands tax regime (IGIC), multi-company management, and a fully self-hosted experience without cloud dependencies.

El Taxinator is a self-hosted accounting and tax management app built for freelancers (autónomos) and small companies (Sociedad Limitada) in the Canary Islands. Upload receipts, invoices, or bank statements — AI extracts and categorizes everything automatically. Manage multiple companies from a single instance, each with its own database and file storage. Calculate IGIC (Modelo 420/425), IRPF (Modelo 130), and corporate tax (Modelo 202/200) with built-in tax calculators.

## Features

- **Zero-setup database** — Ships with an embedded PostgreSQL 17 binary that boots in-process. No Docker, no `apt install postgres`, no setup steps. Run `yarn dev` and you're done.
- **AI Accountant wizard** — Upload a CSV or PDF bank statement, or click "Add Transaction", and a conversational accountant greets you. It asks clarifying questions, batch-confirms obvious rows, remembers durable business facts across sessions (profession, mixed-use accounts, regime), and proactively suggests lawful alternatives when something isn't deductible — always with a legal citation (Modelo casilla, BOE article, LIRPF section). Sessions are resumable, dockable while you use other pages, and end with a downloadable PDF report.
- **Living Spanish tax knowledge packs** — Canary Islands autónomo and SL knowledge ship as markdown (IGIC rates, Modelo deadlines, deductibility rules). Refresh them at any time with your own configured LLM — no paid web-search provider needed. Refreshed packs land as `needs_review` until you mark them verified.
- **Crypto as a first-class object** — Dedicated `/crypto` page, five default categories (disposal, purchase, fee, staking, airdrop), FIFO cost-basis ledger across all holdings, automatic gateway pairing between bank deposits and exchange disposals (Swissborg/Coinbase/Binance/etc.), and per-disposal realised-gain breakdown into matched lots.
- **Canary Islands tax calculators** — Modelo 420 (quarterly IGIC), Modelo 425 (annual IGIC summary), Modelo 130 (quarterly IRPF for autónomos), Modelo 202/200 (corporate tax for SLs), **Modelo 100 annual IRPF with base del ahorro brackets (19/21/23/27/28%)**, and **Modelo 721 informativa** for foreign crypto holdings. All with IGIC rates (0%, 3%, 7%, 9.5%, 15%).
- **Multi-company support** — Manage multiple businesses from one instance. Each company gets its own database inside the embedded cluster. Supports both Autónomo and Sociedad Limitada entity types.
- **Per-company uploads folder** — Each company can keep its receipts and files in its own folder, anywhere on disk (local, external drive, or a Google Drive–synced folder).
- **Invoicing & quotes** — Create, track, and export professional invoices with IGIC and IRPF withholding. Convert quotes to invoices.
- **Multi-language** — Full English and Spanish UI with locale-aware database content (category names, field names, etc. stored in both languages).
- **Multiple AI providers** — Claude, OpenAI, Google Gemini, Mistral, OpenRouter, subscription CLIs (Claude Code, codex), or any custom OpenAI-compatible API (Ollama, vLLM, etc.). Enhanced logging shows which provider/model/thinking level is actually serving each request.
- **Accountant data export** — Generate organized ZIP bundles with transactions, invoices, tax calculations, and receipt attachments — by quarter or full year.
- **Portable backups** — Full database dump + uploaded files in a single `.taxinator.zip`. Import on any instance with one click. Auto-backup to Google Drive with configurable frequency.
- **Bank statement processing** — Upload a bank statement PDF, AI splits it into individual transactions, auto-categorizes, and matches to existing invoices.
- **Currency conversion** — Automatic multi-currency support with historical exchange rates, including crypto (BTC, ETH, etc.).

## Quick Start

```bash
git clone https://github.com/animusystems/el-taxinator.git
cd el-taxinator
yarn install
yarn dev
```

That's it. The first launch initialises an embedded PostgreSQL cluster under
`./data/pgdata/`, picks a free local port, and serves the app at
`http://localhost:7331`. You'll see the entity picker with two options:

- **New Company** — Create a new company. Just pick a name and type (Autónomo or SL). A fresh database is created inside the embedded cluster automatically.
- **Import Backup** — Restore from a `.taxinator.zip` portable bundle.

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Application port | `7331` |
| `TAXINATOR_DATA_DIR` | No | Where to store the embedded Postgres cluster, `entities.json`, and `runtime.json` | `./data` |
| `SELF_HOSTED_MODE` | No | Enable self-hosted mode | `true` |

AI providers are configured in the app UI (Settings > LLM Settings), or via environment variables:

- `OPENAI_API_KEY` / `OPENAI_MODEL_NAME`
- `GOOGLE_API_KEY` / `GOOGLE_MODEL_NAME`
- `MISTRAL_API_KEY` / `MISTRAL_MODEL_NAME`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL_NAME`
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL_NAME`

For Google Drive auto-backup, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then connect in Settings > Backups.

## Data Layout

Everything Taxinator owns lives under `TAXINATOR_DATA_DIR` (default `./data`):

```
./data/
├── pgdata/           ← embedded PostgreSQL cluster (one DB per entity)
├── entities.json     ← list of registered companies
├── runtime.json      ← persisted port + superuser password (regenerated on first run)
└── uploads/          ← receipts, logos, previews — unless an entity overrides its uploads folder
```

To back the whole instance up: stop the app, copy the `./data` directory.
To migrate to another machine: copy `./data` to the new machine and start
the app there. Individual companies can also be exported and imported
one-by-one using `.taxinator.zip` bundles from the Settings page.

## Tax Calculators

Built for the Canary Islands tax regime (REF — Régimen Económico y Fiscal):

| Entity Type | Quarterly | Annual |
|-------------|-----------|--------|
| **Autónomo** | Modelo 420 (IGIC) + Modelo 130 (IRPF) | Modelo 425 (IGIC summary) + **Modelo 100** (annual IRPF with base del ahorro for crypto gains) |
| **Sociedad Limitada** | Modelo 420 (IGIC) + Modelo 202 (Corporate tax) | Modelo 425 + **Modelo 200** (Corporate annual with crypto P&L and staking income) |
| **Both** | — | **Modelo 721** informativa when foreign crypto holdings exceed the €50K year-end threshold |

IGIC rates: 0% (zero), 3% (reduced), 7% (general), 9.5% (increased), 15% (special)

Base del ahorro brackets (Modelo 100, 2026): 19% (0–6K) · 21% (6K–50K) · 23% (50K–200K) · 27% (200K–300K) · 28% (300K+)

Filing deadlines: Q1 → April 20, Q2 → July 20, Q3 → October 20, Q4 → January 30, Modelo 721 → March 31

## Tech Stack

- **Vite + React 19** SPA front-end with [TanStack Router](https://tanstack.com/router)
- **Fastify** API server (`/api/*`) handling uploads, commits, and PDF rendering
- **PostgreSQL 17** via [`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres) — real PG binary spawned in-process, one database per company inside a single cluster
- **Raw SQL** — no ORM, parameterized queries via `pg`
- **tRPC** — type-safe API layer with OpenAPI passthrough
- **react-i18next** — internationalization (English + Spanish) with ICU-style single-brace interpolation
- **LangChain** + subscription-CLI adapters (Claude Code, codex) — AI provider abstraction with balanced-brace JSON parsing for envelope-style CLI output
- **`@react-pdf/renderer`** — session report + invoice PDFs
- **JSZip** — backup/export bundles
- **sharp** — image processing
- **googleapis** — Google Drive auto-backup

## Local Development

```bash
# Prerequisites: Node.js 22+
# Optional: Ghostscript + GraphicsMagick for PDF previews
# macOS: brew install gs graphicsmagick

git clone https://github.com/animusystems/el-taxinator.git
cd el-taxinator
yarn install
yarn dev
```

No `.env` file required, no Docker, no Postgres install. The embedded
cluster boots automatically from `instrumentation.ts` → `lib/embedded-pg.ts`.
The schema is applied lazily on first connection — no migrations to run.

To point at an external Postgres for advanced use cases, set
`DATABASE_URL` or add an entity with an explicit connection string in
`data/entities.json`.

## Acknowledgments

This project is a fork of [Taxinator](https://github.com/vas3k/Taxinator) by [vas3k](https://github.com/vas3k). The original project provided an excellent foundation for AI-powered receipt scanning and transaction management. We've taken it in a new direction:

- Canary Islands tax compliance (IGIC instead of IVA)
- Multi-company management — one database per entity in a shared embedded cluster
- True zero-setup self-hosting: no Docker, no Postgres install, just `yarn dev`
- Portable backup bundles with one-click import and Google Drive auto-backup
- Full English/Spanish bilingual support

Thank you to vas3k and all original contributors for making this possible.

## License

El Taxinator is licensed under the [MIT License](LICENSE).
