# Graph Report - .  (2026-04-13)

## Corpus Check
- Large corpus: 348 files · ~189,508 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1175 nodes · 2159 edges · 76 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 343 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Article` - 49 edges
2. `ScrapeResult` - 29 edges
3. `BaseScraper` - 28 edges
4. `Article` - 24 edges
5. `FilterResult` - 24 edges
6. `trpcMutate()` - 17 edges
7. `TestParseRelativeSpanish` - 13 edges
8. `getEntities()` - 13 edges
9. `TestFormatDateForDisplay` - 12 edges
10. `TestFilterArticles` - 11 edges

## Surprising Connections (you probably didn't know these)
- `getEntities()` --calls--> `loadEntitiesFromEnv()`  [INFERRED]
  src/compat/entities.ts → lib/entities.ts
- `getEntities()` --calls--> `loadEntitiesFromDatabaseUrl()`  [INFERRED]
  src/compat/entities.ts → lib/entities.ts
- `Represents a scraped news article (standalone, mirrors base_scraper.Article).` --uses--> `Article`  [INFERRED]
  scripts/canary_news/date_utils.py → scripts/canary_news/base_scraper.py
- `Result of filtering articles by date.` --uses--> `Article`  [INFERRED]
  scripts/canary_news/date_utils.py → scripts/canary_news/base_scraper.py
- `saveEntities()` --calls--> `getEntitiesFilePath()`  [INFERRED]
  src/compat/entities.ts → lib/entities.ts

## Hyperedges (group relationships)
- **Canary Islands tax regime (REF)** — readme_canary_islands_focus, readme_igic_tax, readme_modelo_420, readme_modelo_425, readme_modelo_130, readme_modelo_202_200, readme_igic_rates, readme_autonomo_vs_sl [EXTRACTED 1.00]
- **AI Import Pipeline** — concept_csv_column_mapping, concept_batched_categorization, concept_import_review_table, concept_import_sessions [EXTRACTED 0.95]
- **Smart Categorization Triad** — concept_categorization_rules, concept_ai_category_suggestions, concept_reanalyze_transactions [EXTRACTED 0.92]
- **Vite SPA Migration Stack** — concept_vite_spa, concept_fastify_api, concept_tanstack_router, concept_tanstack_query [EXTRACTED 0.97]

## Communities

### Community 0 - "File Analysis & Export"
Cohesion: 0.03
Nodes (4): handleProductSelect(), updateItem(), getInitialProviderOrder(), LLMSettingsForm()

### Community 1 - "News Date Parsing"
Cohesion: 0.03
Nodes (25): Article, FilterResult, Represents a scraped news article (standalone, mirrors base_scraper.Article)., Result of filtering articles by date., mock_now(), Tests for date_utils module — Canary Islands news scraper date parsing & filteri, Exactly on the boundary — should be included (>=)., Naive datetimes should be treated as UTC. (+17 more)

### Community 2 - "News Scraper Engine"
Cohesion: 0.04
Nodes (78): Article, BaseScraper, Base scraper class and common utilities for Canary Islands news portals., Main scrape method - override in subclasses., Represents a scraped news article., Result from scraping a single portal., Base class for portal-specific scrapers., Respect rate limits by adding a random delay between requests. (+70 more)

### Community 3 - "Accountant Portal"
Cohesion: 0.04
Nodes (24): createInviteAction(), deleteInviteAction(), revokeInviteAction(), trpcMutate(), modelFromJSON(), preprocessRowData(), apiDelete(), apiGet() (+16 more)

### Community 4 - "Invoice & UI Forms"
Cohesion: 0.03
Nodes (19): isResendConfigured(), requireResend(), sendNewsletterWelcomeEmail(), sendOTPCodeEmail(), createSanitizedErrorResponse(), logErrorForDebug(), sanitizeError(), sanitizeValidationError() (+11 more)

### Community 5 - "Entity Backup & Bundle"
Cohesion: 0.06
Nodes (28): createBundle(), readDirRecursive(), addEntity(), clearActiveEntityFile(), closeAllPools(), closePoolForEntity(), getActiveEntity(), getActiveEntityFilePath() (+20 more)

### Community 6 - "i18n & Categories"
Cohesion: 0.07
Nodes (28): applyCSVMapping(), categorizeTransactions(), categorizeTransactionsInternal(), categorizeTransactionsWithFeedback(), detectCSVMapping(), formatCategoryList(), formatProjectList(), parseAmount() (+20 more)

### Community 7 - "UI Component Library"
Cohesion: 0.05
Nodes (0): 

### Community 8 - "Tax Reports & Settings"
Cohesion: 0.05
Nodes (6): aggregatePerCurrency(), buildStatsWhere(), incompleteTransactionFields(), isTransactionIncomplete(), searchParamsToFilters(), useTransactionFilters()

### Community 9 - "DB Defaults & Schema"
Cohesion: 0.07
Nodes (25): buildConnectionString(), getClusterInfo(), getDataRoot(), getEmbeddedConnectionString(), getEntityDataDir(), getPgDataDir(), getRuntimeFilePath(), initNewCluster() (+17 more)

### Community 10 - "App Data & Import"
Cohesion: 0.07
Nodes (9): assertSafeIdentifier(), buildInsert(), buildUpdate(), camelToSnake(), isJsonString(), mapRow(), queryOne(), serializeValue() (+1 more)

### Community 11 - "Transaction List & Actions"
Cohesion: 0.08
Nodes (12): bulkDeleteTransactionsAction(), createTransaction(), createTransactionAction(), deleteTransactionAction(), deleteTransactionFileAction(), getNewTransactionFormDataAction(), saveTransactionAction(), splitTransactionDataExtraFields() (+4 more)

### Community 12 - "Compat Action Stubs"
Cohesion: 0.06
Nodes (3): handleOpenChange(), handleReanalyzeWithFeedback(), runAnalysis()

### Community 13 - "Auth & Entity Connection"
Cohesion: 0.1
Nodes (4): getCurrentUser(), getSession(), isConnected(), PoorManCache

### Community 14 - "Invoice PDF Generation"
Cohesion: 0.12
Nodes (6): convertQuoteToInvoiceAction(), createInvoiceAction(), deleteInvoiceAction(), trpcMutate(), updateInvoiceAction(), updateInvoiceStatusAction()

### Community 15 - "SPA Route Components"
Cohesion: 0.11
Nodes (4): createTimeEntryAction(), deleteTimeEntryAction(), trpcMutate(), updateTimeEntryAction()

### Community 16 - "LLM Provider Layer"
Cohesion: 0.14
Nodes (2): createAccountantInvite(), generateToken()

### Community 17 - "AI Import Pipeline"
Cohesion: 0.18
Nodes (9): findCommonSubstring(), learnFromImport(), addRuleAction(), applyRulesToCandidates(), deleteRuleAction(), editRuleAction(), matchRule(), toggleRuleAction() (+1 more)

### Community 18 - "Time Tracking"
Cohesion: 0.24
Nodes (13): completeClaudeLogin(), completeCliLogin(), completeCodexLogin(), extractUrl(), getAllAuthStatus(), getClaudeAuthStatus(), getClaudeLoginUrl(), getCliLoginUrl() (+5 more)

### Community 19 - "Transaction Model & SQL"
Cohesion: 0.35
Nodes (10): deleteFromGoogleDrive(), downloadFromGoogleDrive(), getAuthUrl(), getDriveClient(), getOAuth2Client(), getOrCreateFolder(), getTokensFromCode(), listBackups() (+2 more)

### Community 20 - "tRPC Router Registry"
Cohesion: 0.28
Nodes (4): checkRateLimit(), checkRateLimitAndRespond(), cleanupExpiredEntries(), createRateLimitHeaders()

### Community 21 - "Progress Tracking"
Cohesion: 0.25
Nodes (9): Embedded PostgreSQL, Fastify API Server Backend, SSR Hydration Problem, TanStack Query, TanStack Router, tRPC Router Layer, Vite React SPA Frontend, Rationale: Why Vite over Next.js (+1 more)

### Community 22 - "Sidebar Navigation"
Cohesion: 0.29
Nodes (0): 

### Community 23 - "Smart Categorization Rules"
Cohesion: 0.4
Nodes (6): Canary Islands tax focus (REF), Fork of vas3k/Taxinator, IGIC rate set (0/3/7/9.5/15%), IGIC (not IVA), Modelo 420 (quarterly IGIC), Modelo 425 (annual IGIC summary)

### Community 24 - "Dashboard Widgets"
Cohesion: 0.4
Nodes (6): Embedded PostgreSQL (in-process), One database per entity, Google Drive auto-backup, Multi-company (entity) support, Portable .taxinator.zip backups, Zero-setup rationale (no Docker, no external PG)

### Community 25 - "Currency & Stats"
Cohesion: 0.33
Nodes (6): lib/db-types.ts Zod single source of truth, No any types rule, Parameterized SQL only, Raw SQL (no ORM), Single schema.sql, no migrations, mapRow() snake_case↔camelCase conversion

### Community 26 - "File Upload & Preview"
Cohesion: 0.33
Nodes (6): Configurable Data Root, One Cluster at a Time, Per-Profile Data Folder, Portable Profile (zip for backup), Per-Profile Data Isolation Implementation Plan, Per-Profile Data Isolation Design Spec

### Community 27 - "Design Specs & Plans"
Cohesion: 0.4
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (5): AI New Category Suggestions, Categorization Rules Engine, Default Categories for Canary Islands, Smart Categorization & Import Improvements Plan, Smart Categorization & Import Improvements Design Spec

### Community 30 - "Community 30"
Cohesion: 0.5
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.5
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (4): Bank Accounts Table, Import Sessions Table, Accounts + AI Import Implementation Plan, Accounts + AI Import Design Spec

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (3): Autónomo vs Sociedad Limitada entity types, Modelo 130 (IRPF quarterly autónomos), Modelo 202/200 (corporate tax SL)

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): Multiple AI providers (Claude, OpenAI, Gemini, Mistral, OpenRouter), Bank statement PDF AI processing, LangChain AI provider abstraction

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

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
Nodes (2): Server/Client boundary discipline, tRPC + OpenAPI plugin

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): next-intl with [locale] segment, Bilingual EN/ES with locale-aware DB content

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): authedProcedure (auth via tRPC context), Always scope queries by user_id

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): TaxHacker Main Dashboard, Transactions Full App View

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): AI Scanner Receipt Analysis View, AI Scanner Receipt Panel

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): Export Transactions Dialog, Multi-Currency Exchange Rate

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (2): Mistral AI Logo, OpenAI Logo

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Accountant data export ZIP bundle

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Per-company uploads folder

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): Multi-currency + historical FX conversion

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): Self-hosted vs Cloud mode

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): SQL aggregation for stats (SUM/GROUP BY)

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): Transactions List View

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): Invoice Generator UI

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): Custom Fields / LLM Prompt Settings

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): El Taxinator Logo

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): Google Gemini Logo

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Canary Islands News Digest

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Canary Islands News Scraper Module

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): AI CSV Column Mapping

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): Batched LLM Categorization

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): Bank PDF Vision Extraction

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): Import Review Table UI

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): Re-analyze Existing Transactions

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): react-i18next for i18n

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): Server Actions to tRPC Mutations

## Knowledge Gaps
- **66 isolated node(s):** `Base scraper class and common utilities for Canary Islands news portals.`, `Represents a scraped news article.`, `Result from scraping a single portal.`, `Base class for portal-specific scrapers.`, `Respect rate limits by adding a random delay between requests.` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 37`** (2 nodes): `vite.config.ts`, `compat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `theme-toggle.tsx`, `ThemeToggle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `subscription-expired.tsx`, `SubscriptionExpired()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `use-persistent-form-state.tsx`, `usePersistentFormState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `next-image.tsx`, `Image()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `translations.ts`, `useTranslations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `next-intl-routing.ts`, `defineRouting()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `Server/Client boundary discipline`, `tRPC + OpenAPI plugin`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `next-intl with [locale] segment`, `Bilingual EN/ES with locale-aware DB content`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `authedProcedure (auth via tRPC context)`, `Always scope queries by user_id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `TaxHacker Main Dashboard`, `Transactions Full App View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `AI Scanner Receipt Analysis View`, `AI Scanner Receipt Panel`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `Export Transactions Dialog`, `Multi-Currency Exchange Rate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `Mistral AI Logo`, `OpenAI Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `config.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `collapsible.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `default-categories.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `next-link.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Accountant data export ZIP bundle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Per-company uploads folder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `Multi-currency + historical FX conversion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `Self-hosted vs Cloud mode`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `SQL aggregation for stats (SUM/GROUP BY)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `Transactions List View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Invoice Generator UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Custom Fields / LLM Prompt Settings`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `El Taxinator Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `Google Gemini Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Canary Islands News Digest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Canary Islands News Scraper Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `AI CSV Column Mapping`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `Batched LLM Categorization`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `Bank PDF Vision Extraction`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `Import Review Table UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `Re-analyze Existing Transactions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `react-i18next for i18n`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `Server Actions to tRPC Mutations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Article` connect `News Scraper Engine` to `News Date Parsing`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `Article` connect `News Date Parsing` to `News Scraper Engine`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `FilterResult` connect `News Date Parsing` to `News Scraper Engine`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `Article` (e.g. with `Article` and `FilterResult`) actually correct?**
  _`Article` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `ScrapeResult` (e.g. with `Configure logging for the scraper.` and `Run all scrapers and collect results.      Args:         portal_filter: If provi`) actually correct?**
  _`ScrapeResult` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `BaseScraper` (e.g. with `TagororScraper` and `PlanetaCanarioScraper`) actually correct?**
  _`BaseScraper` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `Article` (e.g. with `parse_and_filter_articles()` and `Article`) actually correct?**
  _`Article` has 22 INFERRED edges - model-reasoned connections that need verification._