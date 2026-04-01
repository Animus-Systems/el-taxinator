# Taxinator -- User Scenarios & Feature Documentation

## Overview

Taxinator is an AI-powered personal accounting and tax management application designed primarily for freelancers and self-employed professionals (autonomos) in Spain. It enables users to upload receipts and invoices, have them automatically analyzed by LLMs (OpenAI, Google Gemini, Anthropic Claude, Mistral, or Codex), manage transactions, generate invoices and quotes, track time, compute quarterly Spanish tax returns (Modelo 303, 130, 390), and share read-only access with an accountant.

Taxinator runs as a self-hosted Next.js application backed by PostgreSQL, or as a cloud-hosted SaaS with Stripe-based subscriptions. The interface supports English and Spanish and is fully locale-aware via `next-intl`.

---

## User Scenarios

### 1. Self-Hosted Setup

**Description:** A new user launches Taxinator for the first time in self-hosted mode (`SELF_HOSTED_MODE=true`) and completes initial configuration.

**User Flow:**
1. User starts the application via Docker or `yarn dev`. The app reads environment variables from `.env` including `SELF_HOSTED_MODE=true`, `DATABASE_URL`, and optionally pre-configured API keys.
2. The user navigates to the app URL (default `http://localhost:7331`). Since no self-hosted user exists yet, they are directed to `/self-hosted`.
3. The setup page shows a form to configure:
   - Default currency (e.g., EUR, USD).
   - LLM provider API keys (OpenAI, Google Gemini, Mistral). Keys can also be set via environment variables (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`).
4. On submission (`selfHostedGetStartedAction`), the app creates the self-hosted user (`taxhacker@localhost`), seeds default categories, projects, currencies, fields, and settings, and redirects to `/dashboard`.

**Key Routes:**
- `/self-hosted` -- Setup page
- `/self-hosted/redirect` -- Auto-login redirect for returning users

**Business Rules:**
- Self-hosted mode uses a single fixed user (`taxhacker@localhost`) with an `unlimited` membership plan.
- If the self-hosted user already exists, visiting `/self-hosted` redirects straight to the dashboard.
- Database defaults (19 expense categories, 1 default project, 100+ currencies, 16 transaction fields) are seeded on first setup.

**Edge Cases:**
- If `SELF_HOSTED_MODE` is not `true`, the setup page shows an error instructing the user to set the env var.
- If API keys are provided via environment variables, they take precedence; the setup form still lets users override via settings.

---

### 2. Transaction Management

**Description:** Users create, view, edit, filter, export, and delete financial transactions. Transactions represent income or expense records and are the core data type in the application.

#### 2a. Uploading Receipts/Invoices for AI Analysis

1. From the Dashboard (`/{locale}/dashboard`) or Unsorted page (`/{locale}/unsorted`), the user drags and drops files (images, PDFs, docs) or clicks the upload button.
2. Files are saved to the filesystem under the user's uploads directory and a `File` record is created in the database with `isReviewed: false`.
3. The file appears on the Unsorted page where the user clicks "Analyze" to trigger AI analysis.
4. The system builds an LLM prompt from the user's configured prompt template, field definitions (with LLM hints), categories, and projects, then sends the file (as image attachments) to the configured LLM provider.
5. The AI returns structured JSON with extracted fields: name, description, merchant, total, currency, date, category, project, VAT rate, and recognized text.
6. The user reviews and edits the extracted data in the analysis form, then saves it as a transaction. The file is moved from the unsorted directory to the transaction's directory and marked `isReviewed: true`.

#### 2b. Manual Transaction Creation

1. On the Transactions page (`/{locale}/transactions`), the user clicks "Add Transaction".
2. A dialog appears with fields for name, merchant, total, currency, date, type (income/expense), category, project, and notes.
3. On submit, the transaction is created via `createTransactionAction`.

#### 2c. Editing Transactions

1. User clicks a transaction in the list to navigate to `/{locale}/transactions/{transactionId}`.
2. The edit form shows all fields (standard and custom extra fields). Incomplete required fields are highlighted with a yellow warning banner.
3. Attached files are displayed alongside the form with preview, download, and delete capabilities.
4. Users can upload additional files to an existing transaction.
5. Changes are saved via `saveTransactionAction`.

#### 2d. Bulk Operations

- Users can select multiple transactions in the list and bulk-delete them via `bulkDeleteTransactionsAction`.
- Deleting a transaction also deletes associated files from the filesystem if no other transaction references them.

#### 2e. Filtering and Searching

On `/{locale}/transactions`, users can:
- **Search** by name, merchant, description, note, or extracted text (case-insensitive).
- **Filter by date range** using a date-range picker with presets (this month, last month, this year, etc.).
- **Filter by category** via dropdown.
- **Filter by project** via dropdown.
- **Filter by type** (income/expense).
- **Sort** by any field, ascending or descending (via `ordering` param, prefix `-` for descending).
- Results are paginated at 500 transactions per page.

#### 2f. Exporting Transactions

1. User clicks the "Export" button on the Transactions page.
2. A dialog lets them configure: date range, category/project filters, which fields to include in the CSV, and whether to include attached files.
3. The export generates a ZIP archive containing a CSV file and optionally all attached files.
4. Progress is tracked via a polling mechanism, and the ZIP is downloaded to the browser.

**Key Routes:**
- `/{locale}/transactions` -- List with filters
- `/{locale}/transactions/{transactionId}` -- Detail/edit page
- `/export/transactions` -- Export API endpoint

**Business Rules:**
- Totals are stored in cents (integer) internally and displayed as decimal amounts.
- Multi-currency support: transactions have a `currencyCode` and optionally a `convertedTotal` / `convertedCurrencyCode` for converted amounts.
- Transaction types are `income` or `expense`.
- Custom extra fields (defined by the user) are stored in a JSON `extra` column.
- File cleanup: when a transaction is deleted, its files are deleted from disk only if no other transaction references them.

---

### 3. File Processing & AI Analysis

**Description:** The AI analysis pipeline processes uploaded files through LLM providers to extract transaction data.

**User Flow:**
1. Files are uploaded via drag-and-drop or file picker. Accepted types: `image/*`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`.
2. Images are resized to max 1800x1800px at 90% quality. PDFs are converted to images (up to 10 pages, 150 DPI, max 1500x1500px).
3. On the Unsorted page (`/{locale}/unsorted`), each file shows a preview and an "Analyze" button.
4. If no LLM API key is configured, an alert banner directs the user to `/{locale}/settings/llm`.
5. Clicking "Analyze" calls `analyzeFileAction`, which:
   - Loads the file as image attachments suitable for the LLM.
   - Builds a structured prompt with field definitions, categories, and projects.
   - Generates a JSON schema from the field definitions for structured output.
   - Calls the LLM provider (with fallback: primary provider first, then backup, then remaining providers).
   - Caches the parse result on the file record.
6. The user can click "Analyze All" to process all unsorted files sequentially.

**Splitting Multi-Item Documents:**
- When AI analysis detects multiple line items in a single document (e.g., a receipt with several distinct purchases), the user can split the file into multiple transactions via `splitFileIntoItemsAction`.
- This creates a copy of the original file for each item, pre-filled with that item's extracted data, and deletes the original.

**Key Routes:**
- `/{locale}/unsorted` -- Unsorted file queue
- `/{locale}/files` -- All files (currently returns a 404/placeholder)

**Business Rules:**
- LLM providers are tried in order: primary > backup > remaining fallback order. If one fails, the next is attempted.
- Supported providers: Anthropic Claude, OpenAI, Google Gemini, Mistral, Codex (OpenAI GPT-5.x).
- Each AI scan decrements the user's `aiBalance` (relevant for cloud mode).
- The analysis prompt is fully customizable in settings; it supports template variables: `{fields}`, `{categories}`, `{categories.code}`, `{projects}`, `{projects.code}`.
- Cloud mode enforces storage limits and subscription expiry checks before uploads and analysis.

---

### 4. Invoicing

**Description:** Users create and manage professional invoices with line items, VAT, IRPF retention, and PDF generation.

#### 4a. Creating Invoices

1. Navigate to `/{locale}/invoices` and click "New Invoice".
2. The form at `/{locale}/invoices/new` loads clients, products, and uninvoiced billable time entries.
3. Fill in: invoice number, client, issue date, due date, notes, IRPF retention rate.
4. Add line items: each item has description, quantity, unit price, VAT rate, and position. Items can be populated from the product catalog.
5. Submit calls `createInvoiceAction`. The invoice is created with status `draft`.

#### 4b. Managing Invoice Items

- Items are added/removed dynamically in the form.
- Selecting a product auto-fills description, unit price, and VAT rate.
- Uninvoiced billable time entries are available for quick import into invoice items.

#### 4c. Invoice Status Workflow

Invoices follow a status lifecycle:
- **draft** -- Initial state after creation.
- **sent** -- Marked when the invoice has been sent to the client.
- **paid** -- When payment is received. Setting this status automatically records the `paidAt` timestamp.
- **overdue** -- When payment is past due.
- **cancelled** -- When the invoice is voided.

Status changes are made via a dropdown on the invoice detail page (`/{locale}/invoices/{invoiceId}`) using `updateInvoiceStatusAction`.

#### 4d. PDF Generation and Download

- Each invoice has a "Download PDF" button that hits `/api/invoices/{invoiceId}/pdf`.
- The PDF is generated server-side using `@react-pdf/renderer` with the user's business name and address.
- The PDF includes: invoice number, client details, line items with VAT, subtotal, VAT total, IRPF retention (if applicable), and total payable.

#### 4e. Converting Quotes to Invoices

- From a quote detail page, the user can convert it to an invoice via `convertQuoteToInvoiceAction`.
- All quote items are copied to the new invoice. The quote status is set to `converted`. The invoice is created as `draft`.
- The invoice retains a `quoteId` reference, and the detail page shows a link back to the original quote.

**Key Routes:**
- `/{locale}/invoices` -- Invoice list
- `/{locale}/invoices/new` -- Create invoice
- `/{locale}/invoices/{invoiceId}` -- Invoice detail (view, edit status, download PDF, delete)
- `/api/invoices/{invoiceId}/pdf` -- PDF download endpoint

**Business Rules:**
- Invoice totals are calculated as: `subtotal = sum(qty * unitPrice)`, `vatTotal = sum(qty * unitPrice * vatRate/100)`, `total = subtotal + vatTotal`.
- IRPF retention is calculated on the subtotal and subtracted from the total payable.
- Amounts are stored in cents.
- Only `sent` and `paid` invoices are included in tax calculations (Modelo 303, 130).
- Deleting an invoice removes it permanently (no soft delete).

---

### 5. Quotes

**Description:** Users create quotes (presupuestos) that can later be converted to invoices.

**User Flow:**
1. Navigate to `/{locale}/quotes` and click "New Quote".
2. The form at `/{locale}/quotes/new` loads clients and products.
3. Fill in: quote number, client, issue date, expiry date, notes.
4. Add line items (same structure as invoice items: description, quantity, unit price, VAT rate, position).
5. Submit calls `createQuoteAction`.

**Managing Quotes:**
- View quote detail at `/{locale}/quotes/{quoteId}`.
- Edit quote items via `updateQuoteAction`.
- Delete quotes via `deleteQuoteAction`.
- Convert to invoice: provides an invoice number and calls `convertQuoteToInvoiceAction`. The quote status changes to `converted` and a new draft invoice is created with all items copied.

**Key Routes:**
- `/{locale}/quotes` -- Quote list
- `/{locale}/quotes/new` -- Create quote
- `/{locale}/quotes/{quoteId}` -- Quote detail

**Business Rules:**
- Quote items have the same schema as invoice items (description, quantity, unitPrice, vatRate, position).
- A converted quote cannot be converted again (status = `converted`).
- The invoices page includes a button to navigate to quotes and vice versa.

---

### 6. Client Management

**Description:** Users maintain a client directory for use in invoices, quotes, and time entries.

**User Flow:**
1. Navigate to `/{locale}/clients`.
2. Click "Add" to open the new client dialog.
3. Fill in: name (required), email, phone, address, tax ID (NIF/CIF), notes.
4. Submit creates the client. Clients appear in an alphabetically sorted list.
5. Click a client to edit. Changes are saved via `updateClient`.
6. Delete a client via `deleteClient`.

**Key Routes:**
- `/{locale}/clients` -- Client list with add/edit/delete

**Business Rules:**
- Client fields: name, email, phone, address, taxId (NIF/CIF for Spanish tax identification), notes.
- Clients are referenced by invoices, quotes, and time entries via `clientId`.
- Client details (name, taxId, address, email) appear on invoice PDFs.

---

### 7. Product Catalog

**Description:** Users manage a catalog of products and services for quick insertion into invoices and quotes.

**User Flow:**
1. Navigate to `/{locale}/products`.
2. Click "Add" to open the new product dialog.
3. Fill in: name (required), description, price, currency code, VAT rate, unit (e.g., "hour", "piece").
4. Submit creates the product.
5. Products can be edited or deleted from the list.

**Key Routes:**
- `/{locale}/products` -- Product list with add/edit/delete

**Business Rules:**
- When adding an invoice/quote line item, selecting a product auto-populates description, unit price, and VAT rate.
- Product prices are stored in cents.
- Products are sorted alphabetically by name.

---

### 8. Tax Management (Spanish Tax System)

**Description:** Taxinator calculates Spanish quarterly and annual tax returns based on invoice and expense data.

#### 8a. Tax Dashboard Overview

1. Navigate to `/{locale}/tax`. The dashboard shows the current year by default (configurable via `?year=YYYY`).
2. Displays a summary for all four quarters, each with:
   - Filing deadline.
   - Modelo 303 (VAT) result.
   - Modelo 130 (IRPF) result.
3. Users can click into a specific quarter or view the annual summary.

#### 8b. Quarterly VAT Returns -- Modelo 303

Route: `/{locale}/tax/{year}/{quarter}`

Calculates:
- **IVA repercutido** (VAT charged to clients): from `sent`/`paid` invoices in the quarter period. Items grouped by VAT rate band: general (21%), reduced (10%), super-reduced (4%).
- **IVA soportado** (VAT paid on deductible expenses): estimated from expense transactions in the quarter. Assumes expenses are VAT-inclusive at 21% (approximation: deductible VAT = total / 1.21 * 0.21).
- **Resultado** (casilla 46): IVA repercutido - IVA soportado. Positive = amount to pay; negative = refund.

#### 8c. Quarterly Income Tax -- Modelo 130

Route: `/{locale}/tax/{year}/{quarter}`

Calculates cumulatively from January 1 to end of the quarter:
- **Ingresos** (casilla 01): sum of invoice subtotals (excl. VAT) from sent/paid invoices.
- **Gastos** (casilla 02): sum of expense transaction totals.
- **Rendimiento neto** (casilla 03): max(0, ingresos - gastos).
- **Cuota** (casilla 04): 20% of rendimiento neto.
- **IRPF retenido** (casilla 05): IRPF already withheld by clients on invoices (based on `irpfRate`).
- **A ingresar** (casilla 06): max(0, cuota - IRPF retenido).

#### 8d. Annual Summary -- Modelo 390

Route: `/{locale}/tax/{year}`

Aggregates all four quarterly Modelo 303 results into annual totals:
- Total base and VAT collected per rate band.
- Total deductible VAT.
- Total annual result (sum of quarterly results).

#### 8e. Filing Deadlines

- Q1: April 20
- Q2: July 20
- Q3: October 20
- Q4: January 30 (of the following year)
- Q4 also requires the annual Modelo 390 filing.

**Key Routes:**
- `/{locale}/tax` -- Tax dashboard (year overview)
- `/{locale}/tax/{year}` -- Annual report (Modelo 390)
- `/{locale}/tax/{year}/{quarter}` -- Quarterly report (Modelo 303 + 130)

**Business Rules:**
- Only invoices with status `sent` or `paid` are included in tax calculations.
- Only transactions with type `expense` and a non-null `convertedTotal` are included in expense calculations.
- Modelo 130 uses cumulative figures from January 1 to end of quarter.
- VAT deduction for expenses is an approximation (21% inclusive assumed); users should refine manually.
- Deadlines are displayed with locale-appropriate date formatting.

---

### 9. Time Tracking

**Description:** Users log time spent on projects/clients, run a timer, view summaries, and mark entries as invoiced.

#### 9a. Logging Time Entries

1. Navigate to `/{locale}/time` and click "Log Time".
2. The form at `/{locale}/time/new` includes: description, project, client, start time, end time, duration (auto-calculated if start/end provided), hourly rate, currency, billable toggle, notes.
3. Submit creates the time entry via `createTimeEntry`.
4. Edit existing entries at `/{locale}/time/{id}`.

#### 9b. Timer Widget

- The Time page shows an inline `TimerWidget` at the top.
- Users select a project and client, then start/stop a timer.
- When stopped, the duration is calculated and a time entry is created automatically.

#### 9c. Monthly Summaries

- The `TimeSummary` component displays the current month's totals:
  - Total minutes logged.
  - Billable minutes.
  - Total billable amount (calculated from duration * hourlyRate).
  - Entry count.

#### 9d. Associating Time with Projects/Clients

- Each time entry can be linked to a project (via `projectCode`) and/or a client (via `clientId`).
- Entries can be filtered by project, client, billable status, and invoiced status.

#### 9e. Marking Time as Invoiced

- When creating a new invoice, uninvoiced billable time entries are listed for quick import.
- `markTimeEntriesInvoiced` sets `isInvoiced: true` on selected entries.

**Key Routes:**
- `/{locale}/time` -- Time entries list + timer + monthly summary
- `/{locale}/time/new` -- Log new time entry
- `/{locale}/time/{id}` -- Edit time entry

**Business Rules:**
- Duration is auto-calculated from start/end times if not manually specified: `durationMinutes = (endedAt - startedAt) / 60000`.
- Billable amount = `(durationMinutes / 60) * hourlyRate`.
- `isBillable` defaults to `true`.
- Time entries are sorted by start time descending.

---

### 10. Settings & Configuration

**Description:** A comprehensive settings area where users configure their profile, business details, AI providers, and customize the data model.

#### 10a. Profile Management

Route: `/{locale}/settings/profile`

- Edit user name and email.

#### 10b. Business Information

Route: `/{locale}/settings/business`

- Edit business name and business address. These appear on generated invoice PDFs.

#### 10c. LLM Provider Configuration

Route: `/{locale}/settings/llm`

- Configure API keys for each provider: Anthropic Claude, OpenAI, Google Gemini, Mistral, Codex.
- Select model per provider (e.g., `claude-sonnet-4-6`, `gpt-4o-mini`, `gemini-2.5-flash`).
- Set primary and backup provider for failover ordering.
- Configure thinking level for Anthropic (low/medium/high).
- Edit the system prompt template for AI analysis. Supports variables: `{fields}`, `{categories}`, `{categories.code}`, `{projects}`, `{projects.code}`.

#### 10d. Global Settings

Route: `/{locale}/settings`

- Default currency, default category, default project, default transaction type.
- Toggle welcome message on dashboard.

#### 10e. Currency Management

Route: `/{locale}/settings/currencies`

- Add, edit, or delete currencies. The app ships with 100+ currencies including crypto (BTC, ETH, etc.).
- Custom currencies are not auto-converted.

#### 10f. Category Management

Route: `/{locale}/settings/categories`

- Add, edit, or delete transaction categories.
- Each category has a name, color, and LLM prompt hint (used by AI to classify transactions).
- Default categories include: Advertisement, Food, Insurance, Office Supplies, Online Services, Software, Travel, and more (19 total).
- Deleting a category sets `categoryCode = null` on all associated transactions.

#### 10g. Project Management

Route: `/{locale}/settings/projects`

- Add, edit, or delete projects.
- Each project has a name, color, and LLM prompt hint.
- Default: "Personal" project.
- Deleting a project sets `projectCode = null` on all associated transactions.

#### 10h. Custom Field Management

Route: `/{locale}/settings/fields`

- Manage transaction fields. Standard fields (name, merchant, total, etc.) cannot be deleted but their prompts and visibility can be modified.
- Add custom "extra" fields with types: string, number, boolean.
- Per-field settings:
  - **LLM Prompt**: hint for AI analysis (leave blank to require manual entry).
  - **Show in transactions table**: toggle column visibility in the list.
  - **Show in analysis form**: toggle visibility in the unsorted analysis UI.
  - **Is required**: marks the field as required (incomplete required fields show a warning on transaction detail).

#### 10i. Accountant Access

Route: `/{locale}/settings/accountant`

- Create, manage, and revoke accountant invites (see Scenario 12).

#### 10j. Backup & Restore

Route: `/{locale}/settings/backups`

- **Download backup**: creates a ZIP archive containing JSON exports of settings, currencies, categories, projects, fields, files metadata, and transactions, plus all uploaded files. Progress is tracked during archival.
- **Restore from backup**: upload a previously downloaded ZIP. This is destructive -- it deletes all existing data before importing. Requires explicit confirmation checkbox. Reports import counts per model after completion.

#### 10k. Danger Zone

Route: `/{locale}/settings/danger`

- **Reset main LLM prompt**: restores the system prompt to its default value.
- **Reset fields, currencies and categories**: re-seeds all default fields, currencies, and categories (uses upsert, so existing items with matching codes are updated).

**Key Routes:**
- `/{locale}/settings` -- Global defaults
- `/{locale}/settings/profile` -- User profile
- `/{locale}/settings/business` -- Business info
- `/{locale}/settings/llm` -- AI/LLM configuration
- `/{locale}/settings/currencies` -- Currency management
- `/{locale}/settings/categories` -- Category management
- `/{locale}/settings/projects` -- Project management
- `/{locale}/settings/fields` -- Custom fields
- `/{locale}/settings/accountant` -- Accountant access
- `/{locale}/settings/backups` -- Backup & restore
- `/{locale}/settings/danger` -- Reset operations

---

### 11. CSV Import

**Description:** Users import transactions in bulk from CSV files.

**User Flow:**
1. Navigate to `/{locale}/import/csv`.
2. Upload a CSV file (max 50 MB, max 100,000 rows). Files larger than 5 MB use streaming parsing.
3. The file is parsed via `parseCSVAction` using `@fast-csv/parse`. The parsed rows are displayed in a table.
4. The user maps CSV columns to Taxinator transaction fields using dropdowns. Available mappable fields: name, description, merchant, total, currencyCode, convertedTotal, convertedCurrencyCode, type, note, categoryCode, projectCode, issuedAt.
5. The user reviews the mapped data and submits.
6. `saveTransactionsAction` iterates through rows, applying field-specific import transformations:
   - Totals are multiplied by 100 (converting dollars/euros to cents).
   - Types are lowercased.
   - Categories and projects are matched by name or code; if not found, they are created automatically.
   - Dates are parsed from strings to Date objects.
7. All transactions are created and the user is redirected to the transactions list.

**Key Routes:**
- `/{locale}/import/csv` -- CSV import interface

**Business Rules:**
- Only `.csv` files are accepted.
- File size limit: 50 MB. Row limit: 100,000.
- Category/project auto-creation: if a CSV contains a category or project name that does not exist, it is created automatically with a code derived from the name.
- Duplicate detection is not built-in; users should ensure the CSV does not contain duplicates.
- The import uses the `EXPORT_AND_IMPORT_FIELD_MAP` which defines per-field import/export transformation logic.

---

### 12. Accountant Portal

**Description:** Users share read-only access to their financial data with accountants or advisors via token-based invite links.

#### 12a. Creating Accountant Invites

1. Navigate to `/{locale}/settings/accountant`.
2. Click "Create Invite" and fill in: accountant name, email (optional), expiry date (optional).
3. Configure permissions: which sections the accountant can access (transactions, invoices, tax, time tracking). Defaults: transactions, invoices, and tax enabled; time tracking disabled.
4. A unique 64-character hex token is generated. The invite URL is displayed as `{BASE_URL}/accountant/{token}`.

#### 12b. Read-Only Accountant Access

1. The accountant opens the invite URL in their browser (no login required).
2. They see the Accountant Portal at `/accountant/{token}` with cards for each permitted section.
3. Available sections based on permissions:
   - `/accountant/{token}/transactions` -- View all transactions.
   - `/accountant/{token}/invoices` -- View invoices and quotes.
   - `/accountant/{token}/tax` -- View tax reports.
   - `/accountant/{token}/time` -- View time entries.
4. All access is logged via `logAccountantAccess` (section, IP address, user agent).

#### 12c. Accountant Comments

- Accountants can leave comments on specific entities (transactions, invoices) via `createAccountantComment`.
- Comments are tied to the invite and the entity type/ID.
- The user can view all comments from an accountant.

**Managing Invites:**
- Revoke an invite (sets `isActive: false`) without deleting it, preserving access logs.
- Delete an invite entirely.
- View access logs (last 100 entries) showing when and from where the accountant accessed data.

**Key Routes:**
- `/{locale}/settings/accountant` -- Invite management
- `/accountant/{token}` -- Accountant portal home
- `/accountant/{token}/transactions` -- Read-only transactions
- `/accountant/{token}/invoices` -- Read-only invoices
- `/accountant/{token}/tax` -- Read-only tax reports
- `/accountant/{token}/time` -- Read-only time entries

**Business Rules:**
- Tokens are 32-byte random hex strings (64 characters).
- Expired invites (`expiresAt < now`) and inactive invites (`isActive: false`) return 404.
- No authentication is required for accountant access -- the token itself is the credential.
- All accountant views are read-only; no mutations are possible through the portal.

---

### 13. Multi-Language Support

**Description:** Taxinator supports English and Spanish via `next-intl` with locale-based routing.

**User Flow:**
1. The app uses locale-prefixed routes: `/{locale}/dashboard`, `/{locale}/transactions`, etc.
2. The default locale is `en`. When the locale is the default, the prefix is omitted (`localePrefix: "as-needed"`), so `/dashboard` works for English.
3. Users switch language via a locale switcher in the navigation.
4. All UI strings, page titles, and form labels are translated using message files.
5. Tax-related labels include Spanish terminology (e.g., "IVA repercutido", "Retención IRPF", filing deadline dates formatted per locale).

**Configuration:**
- Supported locales: `en`, `es`.
- Default locale: `en`.
- Routing defined in `routing.ts` using `next-intl/routing`.
- Translation files in `messages/en.json` and `messages/es.json`.

**Edge Cases:**
- Accountant portal routes (`/accountant/{token}/*`) are not locale-prefixed.
- Auth routes (`/enter`, `/self-hosted`, `/cloud`) are not locale-prefixed.
- Legal doc routes (`/docs/privacy_policy`, `/docs/terms`, `/docs/cookie`, `/docs/ai`) are not locale-prefixed.

---

### 14. Authentication

**Description:** Taxinator supports two authentication modes depending on deployment.

#### 14a. Email OTP Login (Cloud Mode)

1. When `SELF_HOSTED_MODE` is not `true`, the app runs in cloud mode.
2. Users navigate to `/enter` to see the login form.
3. The user enters their email address and receives a one-time password (OTP) via email (sent through Resend).
4. After entering the OTP, a session is created via Better Auth.
5. New users are automatically provisioned with default data (categories, currencies, fields, etc.) on first login.
6. Cloud users may have subscription plans and storage limits enforced via Stripe integration.

#### 14b. Self-Hosted Auto-Login

1. When `SELF_HOSTED_MODE=true`, the `/enter` route redirects to `/self-hosted/redirect`.
2. A single shared user (`taxhacker@localhost`) is used. No email or password is required.
3. The app auto-creates and auto-logs-in this user, redirecting to `/dashboard`.

#### 14c. Session Management

- Sessions are managed by Better Auth with a configurable secret (`BETTER_AUTH_SECRET`).
- `getCurrentUser()` is called in every authenticated page/action to retrieve the current user.
- In self-hosted mode, if the user does not exist yet, they are redirected to the setup page.

**Key Routes:**
- `/enter` -- Cloud login page
- `/self-hosted` -- Self-hosted first-time setup
- `/self-hosted/redirect` -- Auto-login redirect

**Business Rules:**
- Signups can be disabled via `DISABLE_SIGNUP=true` (automatically set in self-hosted mode).
- The auth secret must be at least 16 characters; a warning is logged in production if the default is used.
- Cloud mode supports Stripe-based subscription plans with `membershipPlan`, `membershipExpiresAt`, `storageLimit`, and `aiBalance` fields on the user.

---

### 15. Apps (Extensible Modules)

**Description:** Taxinator includes an "Apps" section for extended functionality built as self-contained modules.

**Current App: Invoice Generator**

Route: `/{locale}/apps/invoices`

This is a standalone invoice PDF generator (separate from the main invoicing system in Scenario 4):
1. User fills in invoice details: from/to addresses, invoice number, date, currency, line items with quantities and rates, additional taxes, additional fees.
2. The app generates a styled PDF using `@react-pdf/renderer`.
3. Users can download the PDF directly.
4. Users can save the invoice as a transaction (creates an income transaction with the PDF attached as a file).
5. Supports custom templates that persist via the AppData model.

**Key Routes:**
- `/{locale}/apps` -- App listing
- `/{locale}/apps/invoices` -- Invoice generator app

---

### 16. Dashboard

**Description:** The main landing page after login, providing an overview and quick actions.

**User Flow:**
1. Navigate to `/{locale}/dashboard`.
2. The dashboard shows:
   - **Drop Zone Widget**: drag-and-drop area for quick file uploads.
   - **Unsorted Widget**: count of unreviewed files with a link to the unsorted page.
   - **Welcome Widget**: dismissible welcome message (hidden via setting `is_welcome_message_hidden`).
   - **Stats Widget**: income, expenses, and profit breakdowns per currency, filterable by date range. Includes time-series charts (grouped by day if range <= 50 days, otherwise by month) and category breakdowns.

**Key Routes:**
- `/{locale}/dashboard` -- Main dashboard

**Business Rules:**
- Dashboard stats respect the same date filters as transactions.
- Stats are calculated per currency (multi-currency aware).
- Time series data only includes transactions in the user's default currency for charting simplicity.
