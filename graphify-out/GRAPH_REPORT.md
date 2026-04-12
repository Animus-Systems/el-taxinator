# Graph Report - .  (2026-04-12)

## Corpus Check
- Large corpus: 358 files · ~169,859 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 868 nodes · 1666 edges · 58 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 141 edges (avg confidence: 0.53)
- Token cost: 1,100 input · 620 output

## God Nodes (most connected - your core abstractions)
1. `getEntities()` - 13 edges
2. `PoorManCache` - 9 edges
3. `getDriveClient()` - 7 edges
4. `safePathJoin()` - 6 edges
5. `request()` - 6 edges
6. `deleteSettingsItem()` - 5 edges
7. `getEntityById()` - 5 edges
8. `saveEntities()` - 5 edges
9. `getEntityDataDir()` - 5 edges
10. `initNewCluster()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Portable .taxinator.zip backups` --conceptually_related_to--> `Embedded PostgreSQL (in-process)`  [INFERRED]
  README.md → CLAUDE.md
- `Multi-company (entity) support` --conceptually_related_to--> `One database per entity`  [EXTRACTED]
  README.md → CLAUDE.md
- `Multi-company (entity) support` --conceptually_related_to--> `Embedded PostgreSQL (in-process)`  [EXTRACTED]
  README.md → CLAUDE.md
- `Bilingual EN/ES with locale-aware DB content` --conceptually_related_to--> `next-intl with [locale] segment`  [EXTRACTED]
  README.md → CLAUDE.md
- `Zero-setup rationale (no Docker, no external PG)` --rationale_for--> `Embedded PostgreSQL (in-process)`  [EXTRACTED]
  README.md → CLAUDE.md

## Hyperedges (group relationships)
- **Canary Islands tax regime (REF)** — readme_canary_islands_focus, readme_igic_tax, readme_modelo_420, readme_modelo_425, readme_modelo_130, readme_modelo_202_200, readme_igic_rates, readme_autonomo_vs_sl [EXTRACTED 1.00]

## Communities

### Community 0 - "Transaction UI & Analysis"
Cohesion: 0.03
Nodes (2): handleProductSelect(), updateItem()

### Community 1 - "Accountant Access"
Cohesion: 0.03
Nodes (11): createAccountantInvite(), generateToken(), assertSafeIdentifier(), buildInsert(), buildUpdate(), camelToSnake(), isJsonString(), mapRow() (+3 more)

### Community 2 - "Export & Reports"
Cohesion: 0.03
Nodes (0): 

### Community 3 - "Auth & Entity Connection"
Cohesion: 0.04
Nodes (5): addAndConnectAction(), connectAction(), getCurrentUser(), getSession(), isConnected()

### Community 4 - "Import/Export Pipeline"
Cohesion: 0.05
Nodes (11): parseCSVAction(), parseCSVWithStreaming(), aggregatePerCurrency(), buildStatsWhere(), incompleteTransactionFields(), isTransactionIncomplete(), createTransaction(), splitTransactionDataExtraFields() (+3 more)

### Community 5 - "AI Document Analysis"
Cohesion: 0.06
Nodes (17): createSanitizedErrorResponse(), logErrorForDebug(), sanitizeError(), sanitizeValidationError(), formatFilePath(), fullPathForFile(), getStaticDirectory(), getTransactionFileUploadPath() (+9 more)

### Community 6 - "Backups & Invoices"
Cohesion: 0.06
Nodes (11): modelFromJSON(), preprocessRowData(), calculateSubtotal(), calculateTaxes(), calculateTotal(), generateCacheKey(), GET(), getAllFilePaths() (+3 more)

### Community 7 - "Settings Actions"
Cohesion: 0.05
Nodes (6): cleanupUserTables(), generateInvoicePDF(), parseCSVAction(), parseCSVWithStreaming(), restoreBackupAction(), saveInvoiceAsTransactionAction()

### Community 8 - "Entity Management"
Cohesion: 0.09
Nodes (26): addEntity(), clearActiveEntityFile(), closeAllPools(), closePoolForEntity(), getActiveEntity(), getActiveEntityFilePath(), getActiveEntityId(), getActiveEntityIdFromFile() (+18 more)

### Community 9 - "Bundle Backup/Restore"
Cohesion: 0.07
Nodes (16): createBundle(), readDirRecursive(), buildConnectionString(), getClusterInfo(), getDataRoot(), getEmbeddedConnectionString(), getEntityDataDir(), getPgDataDir() (+8 more)

### Community 10 - "LLM Provider Config"
Cohesion: 0.08
Nodes (8): requestCLI(), requestLLM(), requestLLMUnified(), deleteCategoryAction(), deleteCurrencyAction(), deleteFieldAction(), deleteProjectAction(), deleteSettingsItem()

### Community 11 - "CLI Authentication"
Cohesion: 0.24
Nodes (13): completeClaudeLogin(), completeCliLogin(), completeCodexLogin(), extractUrl(), getAllAuthStatus(), getClaudeAuthStatus(), getClaudeLoginUrl(), getCliLoginUrl() (+5 more)

### Community 12 - "Google Drive Integration"
Cohesion: 0.35
Nodes (10): deleteFromGoogleDrive(), downloadFromGoogleDrive(), getAuthUrl(), getDriveClient(), getOAuth2Client(), getOrCreateFolder(), getTokensFromCode(), listBackups() (+2 more)

### Community 13 - "Email Service"
Cohesion: 0.33
Nodes (4): isResendConfigured(), requireResend(), sendNewsletterWelcomeEmail(), sendOTPCodeEmail()

### Community 14 - "Cache Implementation"
Cohesion: 0.33
Nodes (1): PoorManCache

### Community 15 - "Rate Limiting"
Cohesion: 0.28
Nodes (4): checkRateLimit(), checkRateLimitAndRespond(), cleanupExpiredEntries(), createRateLimitHeaders()

### Community 16 - "Invite Manager UI"
Cohesion: 0.25
Nodes (0): 

### Community 17 - "Pagination Component"
Cohesion: 0.29
Nodes (0): 

### Community 18 - "API Client"
Cohesion: 0.52
Nodes (6): apiDelete(), apiGet(), apiPatch(), apiPost(), apiPut(), request()

### Community 19 - "Canary Islands Tax"
Cohesion: 0.4
Nodes (6): Canary Islands tax focus (REF), Fork of vas3k/Taxinator, IGIC rate set (0/3/7/9.5/15%), IGIC (not IVA), Modelo 420 (quarterly IGIC), Modelo 425 (annual IGIC summary)

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (6): Embedded PostgreSQL (in-process), One database per entity, Google Drive auto-backup, Multi-company (entity) support, Portable .taxinator.zip backups, Zero-setup rationale (no Docker, no external PG)

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (6): lib/db-types.ts Zod single source of truth, No any types rule, Parameterized SQL only, Raw SQL (no ORM), Single schema.sql, no migrations, mapRow() snake_case↔camelCase conversion

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (6): Configurable Data Root, One Cluster at a Time, Per-Profile Data Folder, Portable Profile (zip for backup), Per-Profile Data Isolation Implementation Plan, Per-Profile Data Isolation Design Spec

### Community 23 - "Community 23"
Cohesion: 0.6
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.5
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (3): Autónomo vs Sociedad Limitada entity types, Modelo 130 (IRPF quarterly autónomos), Modelo 202/200 (corporate tax SL)

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (3): Multiple AI providers (Claude, OpenAI, Gemini, Mistral, OpenRouter), Bank statement PDF AI processing, LangChain AI provider abstraction

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (2): next-intl with [locale] segment, Bilingual EN/ES with locale-aware DB content

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (2): authedProcedure (auth via tRPC context), Always scope queries by user_id

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): Server/Client boundary discipline, tRPC + OpenAPI plugin

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (2): AI Scanner Receipt Analysis View, AI Scanner Receipt Panel

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (2): TaxHacker Main Dashboard, Transactions Full App View

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): Export Transactions Dialog, Multi-Currency Exchange Rate

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (2): Mistral AI Logo, OpenAI Logo

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): Accountant data export ZIP bundle

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Per-company uploads folder

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Multi-currency + historical FX conversion

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Self-hosted vs Cloud mode

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): SQL aggregation for stats (SUM/GROUP BY)

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Graph Report (2026-04-09)

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Transactions List View

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Invoice Generator UI

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Custom Fields / LLM Prompt Settings

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Google Gemini Logo

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): El Taxinator Logo

## Knowledge Gaps
- **39 isolated node(s):** `LangChain AI provider abstraction`, `Accountant data export ZIP bundle`, `Google Drive auto-backup`, `Bank statement PDF AI processing`, `Per-company uploads folder` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 28`** (2 nodes): `instrumentation.ts`, `register()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `theme-toggle.tsx`, `ThemeToggle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `use-persistent-form-state.tsx`, `usePersistentFormState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `next-intl with [locale] segment`, `Bilingual EN/ES with locale-aware DB content`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `authedProcedure (auth via tRPC context)`, `Always scope queries by user_id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `Server/Client boundary discipline`, `tRPC + OpenAPI plugin`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `AI Scanner Receipt Analysis View`, `AI Scanner Receipt Panel`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `TaxHacker Main Dashboard`, `Transactions Full App View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `Export Transactions Dialog`, `Multi-Currency Exchange Rate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Mistral AI Logo`, `OpenAI Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `entities-create-actions.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `entities-actions.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `settings-actions.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `config.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `collapsible.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `Accountant data export ZIP bundle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Per-company uploads folder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Multi-currency + historical FX conversion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Self-hosted vs Cloud mode`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `SQL aggregation for stats (SUM/GROUP BY)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Graph Report (2026-04-09)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Transactions List View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Invoice Generator UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Custom Fields / LLM Prompt Settings`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Google Gemini Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `El Taxinator Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PoorManCache` connect `Cache Implementation` to `Accountant Access`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `getEntities()` (e.g. with `loadEntitiesFromFile()` and `loadEntitiesFromEnv()`) actually correct?**
  _`getEntities()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `getDriveClient()` (e.g. with `getOAuth2Client()` and `getOrCreateFolder()`) actually correct?**
  _`getDriveClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `safePathJoin()` (e.g. with `getStaticDirectory()` and `getUserPreviewsDirectory()`) actually correct?**
  _`safePathJoin()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `request()` (e.g. with `apiGet()` and `apiPost()`) actually correct?**
  _`request()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LangChain AI provider abstraction`, `Accountant data export ZIP bundle`, `Google Drive auto-backup` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Transaction UI & Analysis` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._