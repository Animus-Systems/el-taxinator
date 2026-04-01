<div align="center"><a name="readme-top"></a>

<img src="public/logo/512.png" alt="" width="320">

<br>

# El Taxinator — Self-hosted back office for Canary Islands businesses

</div>

> **Note:** This project is a fork of [Taxinator by vas3k](https://github.com/vas3k/Taxinator). We are grateful to the original creators for building the foundation — their work on AI-powered receipt scanning, transaction management, and the overall architecture made this fork possible. El Taxinator takes the project in a different direction, focusing specifically on the Canary Islands tax regime (IGIC), multi-company management, and a fully self-hosted experience without cloud dependencies.

El Taxinator is a self-hosted accounting and tax management app built for freelancers (autónomos) and small companies (Sociedad Limitada) in the Canary Islands. Upload receipts, invoices, or bank statements — AI extracts and categorizes everything automatically. Manage multiple companies from a single instance, each with its own database. Calculate IGIC (Modelo 420/425), IRPF (Modelo 130), and corporate tax (Modelo 202/200) with built-in tax calculators.

## Features

- **AI-powered document processing** — Upload photos of receipts, invoices, or bank statement PDFs. AI extracts transactions, categorizes them, and matches bank entries to invoices automatically.
- **Canary Islands tax calculators** — Modelo 420 (quarterly IGIC), Modelo 425 (annual IGIC summary), Modelo 130 (quarterly IRPF for autónomos), Modelo 202/200 (corporate tax for SLs). All with IGIC rates (0%, 3%, 7%, 9.5%, 15%).
- **Multi-company support** — Manage multiple businesses from one instance. Each company has its own PostgreSQL database. Switch between them from the sidebar. Supports both Autónomo and Sociedad Limitada entity types.
- **Invoicing & quotes** — Create, track, and export professional invoices with IGIC and IRPF withholding. Convert quotes to invoices. Import billable time entries.
- **Time tracking** — Log billable hours, track by project and client, import into invoices.
- **Multi-language** — Full English and Spanish UI with locale-aware database content (category names, field names, etc. stored in both languages).
- **Multiple AI providers** — Claude, OpenAI, Google Gemini, Mistral, OpenRouter, or any custom OpenAI-compatible API (Ollama, vLLM, etc.).
- **Accountant data export** — Generate organized ZIP bundles with transactions, invoices, tax calculations, time entries, and receipt attachments — by quarter or full year.
- **Portable backups** — Full database dump + uploaded files in a single `.taxinator.zip`. Import on any instance. Auto-backup to Google Drive with configurable frequency.
- **Bank statement processing** — Upload a bank statement PDF, AI splits it into individual transactions, auto-categorizes, and matches to existing invoices.
- **Currency conversion** — Automatic multi-currency support with historical exchange rates, including crypto (BTC, ETH, etc.).
- **Docker auto-provisioning** — Add a new company and auto-create a PostgreSQL database via Docker with one click.

## Quick Start

### Using Docker Compose

```bash
git clone https://github.com/animusystems/el-taxinator.git
cd el-taxinator

# Start the database
docker compose up -d

# Install dependencies and start the app
yarn install
cp .env.example .env
yarn dev
```

Visit `http://localhost:7331`. You'll see the entity picker — click **Add New Company**, enter your database credentials, and you're in.

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the default entity | — |
| `UPLOAD_PATH` | No | Directory for uploaded files | `./uploads` |
| `PORT` | No | Application port | `7331` |
| `BASE_URL` | No | Public URL of the app | `http://localhost:7331` |
| `SELF_HOSTED_MODE` | No | Enable self-hosted mode | `true` |

AI providers are configured in the app UI (Settings > LLM Settings), or via environment variables:

- `OPENAI_API_KEY` / `OPENAI_MODEL_NAME`
- `GOOGLE_API_KEY` / `GOOGLE_MODEL_NAME`
- `MISTRAL_API_KEY` / `MISTRAL_MODEL_NAME`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL_NAME`
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL_NAME`

For Google Drive auto-backup, configure in Settings > Backups (no env vars needed).

## Multi-Company Setup

El Taxinator supports multiple companies, each with its own database. There are two ways to configure entities:

### Option 1: Through the UI (recommended)

1. Visit `http://localhost:7331`
2. Click **Add New Company**
3. Enter the company name, type (Autónomo or SL), and database credentials
4. Or click **Auto (Docker)** to create a PostgreSQL container automatically

Entities are saved to `data/entities.json` and persist across restarts.

### Option 2: Via environment variable

```bash
ENTITIES='[
  {"id":"seth","name":"Seth (Autónomo)","type":"autonomo","db":"postgresql://taxinator:taxinator@localhost:5435/taxinator"},
  {"id":"acme","name":"Acme SL","type":"sl","db":"postgresql://taxinator:taxinator@localhost:5436/taxinator"}
]'
```

## Tax Calculators

Built for the Canary Islands tax regime (REF — Régimen Económico y Fiscal):

| Entity Type | Quarterly | Annual |
|-------------|-----------|--------|
| **Autónomo** | Modelo 420 (IGIC) + Modelo 130 (IRPF) | Modelo 425 (IGIC summary) |
| **Sociedad Limitada** | Modelo 420 (IGIC) + Modelo 202 (Corporate tax) | Modelo 425 + Modelo 200 (Corporate annual) |

IGIC rates: 0% (zero), 3% (reduced), 7% (general), 9.5% (increased), 15% (special)

Filing deadlines: Q1 → April 20, Q2 → July 20, Q3 → October 20, Q4 → January 30

## Tech Stack

- **Next.js 16** — Frontend and API
- **PostgreSQL 17** — Database (one per company)
- **Raw SQL** — No ORM, direct parameterized queries via `pg`
- **tRPC** — Type-safe API layer
- **next-intl** — Internationalization (English + Spanish)
- **LangChain** — AI provider abstraction
- **JSZip** — Backup/export bundles
- **sharp** — Image processing
- **googleapis** — Google Drive auto-backup

## Local Development

```bash
# Prerequisites: Node.js 20.19+, PostgreSQL 17+, Ghostscript, GraphicsMagick
# macOS: brew install gs graphicsmagick

# Clone and install
git clone https://github.com/animusystems/el-taxinator.git
cd el-taxinator
yarn install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Start database
docker compose up -d

# Start dev server
yarn dev
```

The schema is applied automatically when you connect to a new database — no migrations to run.

## Acknowledgments

This project is a fork of [Taxinator](https://github.com/vas3k/Taxinator) by [vas3k](https://github.com/vas3k). The original project provided an excellent foundation for AI-powered receipt scanning and transaction management. We're taking it in a new direction focused on:

- Canary Islands tax compliance (IGIC instead of IVA)
- Multi-company management with separate databases
- Self-hosted-first with no cloud dependencies
- DB-credential-based authentication (no email/password accounts)
- Portable backup bundles with Google Drive auto-backup
- Full English/Spanish bilingual support

Thank you to vas3k and all original contributors for making this possible.

## License

El Taxinator is licensed under the [MIT License](LICENSE).
