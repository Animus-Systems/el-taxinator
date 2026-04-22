# Changelog

All notable changes to El Taxinator are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Invoice template logos no longer appear in the unreviewed inbox. Logo uploads now go through a dedicated `POST /api/files/upload-asset` endpoint that persists with `is_reviewed = true`. Migration v41 backfills any previously-uploaded logos so they drop out of the inbox automatically on next launch.

## [0.5.0] — 2026-04-22

First tracked release. Feature set as of this version:

### Invoicing

- Customer invoices and quotes with numbered series per kind (factura ordinaria and factura simplificada).
- Named invoice templates controlling logo position, accent color, font preset, business/header/footer/bank-details text, and per-label overrides. Editable as a dialog with a live side-by-side PDF preview.
- Automatic PDF generation on draft creation and regeneration on status change, content edits, or currency change.
- Draft / cancelled / rejected watermarks on the PDF.
- Page numbering on all generated PDFs.
- **Non-EUR invoice FX block** — ECB daily reference rates cached locally; invoices denominated in GBP / USD / other show a *Price in EUR* block on the PDF and in the detail view with the locked rate, effective date, and attribution URL. Rate is locked at the invoice's issue date (weekend / holiday fallback to the prior trading day) and preserved across re-saves; switching currency triggers a fresh lookup and PDF regeneration.
- Inline currency picker on the detail view with search and merge of user-defined currencies.
- Quotes share invoice templates and convert to invoices in one click.

### Purchases (libro de facturas recibidas)

- Supplier contacts, line items, VAT / IRPF handling, and payment allocation against bank transactions.

### Transactions

- Embedded-Postgres import with AI-assisted categorization, rule-based automation, passive learning from repeated recategorizations, and vendor-receipt matching.
- Bank statement PDF → per-row transaction extraction.
- Multi-currency support with historical rates, including crypto.

### Tax

- Modelo 420 / 425 (quarterly and annual IGIC), Modelo 130 (autónomo quarterly IRPF), Modelo 202 / 200 (SL corporate), Modelo 100 (unified annual IRPF with business, employment, rental, investments, and deductions), Modelo 721 (foreign crypto).
- Per-user filing checklist + Mark-as-filed per modelo.
- Canary Islands IGIC rates: 0 %, 3 %, 7 %, 9.5 %, 15 %.

### Crypto & stocks

- FIFO cost-basis ledger shared across crypto and stocks (`asset_class` column).
- Gateway pairing between bank deposits and exchange disposals (Swissborg, Coinbase, Binance, Interactive Brokers, Trade Republic, Vanguard, DeGiro, eToro, …).

### Assistant & wizard

- Conversational AI accountant for CSV / PDF bank statement ingestion with session resume and downloadable PDF report.
- Floating chat assistant with rolling 100-message history + automatic summarization.
- Living Spanish tax knowledge packs (theory + per-modelo filing procedures) with LLM refresh.

### Infrastructure

- Embedded PostgreSQL 17 cluster — no Docker, no external DB. One database per company inside a shared cluster.
- Portable `.taxinator.zip` backup / import + Google Drive auto-backup.
- Multi-company support (Autónomo, Sociedad Limitada, Individual).
- Full English + Spanish UI.
- Multiple AI providers: Claude, OpenAI, Gemini, Mistral, OpenRouter, Claude Code CLI, codex, or any OpenAI-compatible API.

[Unreleased]: https://github.com/Animus-Systems/el-taxinator/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Animus-Systems/el-taxinator/releases/tag/v0.5.0
