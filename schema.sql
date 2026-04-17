-- Taxinator Database Schema
-- Single file, no migrations. Applied to fresh databases by lib/schema.ts.

-- ─── Core ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL,
    avatar text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    membership_plan text,
    membership_expires_at timestamp(3),
    is_email_verified boolean DEFAULT false NOT NULL,
    storage_used integer DEFAULT 0 NOT NULL,
    storage_limit integer DEFAULT -1 NOT NULL,
    ai_balance integer DEFAULT 0 NOT NULL,
    stripe_customer_id text,
    business_address text,
    business_bank_details text,
    business_logo text,
    business_name text,
    business_tax_id text,
    entity_type text
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    value text
);
CREATE UNIQUE INDEX settings_user_id_code_key ON settings (user_id, code);

CREATE TABLE categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#000000' NOT NULL,
    llm_prompt text,
    tax_form_ref text,
    is_default boolean DEFAULT false,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX categories_user_id_code_key ON categories (user_id, code);

CREATE TABLE projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#000000' NOT NULL,
    llm_prompt text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX projects_user_id_code_key ON projects (user_id, code);

CREATE TABLE fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'string' NOT NULL,
    llm_prompt text,
    options jsonb,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_visible_in_list boolean DEFAULT false NOT NULL,
    is_visible_in_analysis boolean DEFAULT false NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_extra boolean DEFAULT true NOT NULL
);
CREATE UNIQUE INDEX fields_user_id_code_key ON fields (user_id, code);

CREATE TABLE currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL
);
CREATE UNIQUE INDEX currencies_user_id_code_key ON currencies (user_id, code);

-- ─── Files & Transactions ────────────────────────────────────────────────────

CREATE TABLE files (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename text NOT NULL,
    path text NOT NULL,
    mimetype text NOT NULL,
    metadata jsonb,
    is_reviewed boolean DEFAULT false NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cached_parse_result jsonb,
    is_splitted boolean DEFAULT false NOT NULL
);

CREATE TABLE transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text,
    description text,
    merchant text,
    total integer,
    currency_code text,
    converted_total integer,
    converted_currency_code text,
    type text DEFAULT 'expense',
    note text,
    files jsonb DEFAULT '[]' NOT NULL,
    income_source_id uuid,
    applied_rule_id uuid,
    extra jsonb,
    category_code text,
    project_code text,
    issued_at timestamp(3),
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    text text,
    items jsonb DEFAULT '[]' NOT NULL,
    deductible boolean,
    account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'business',
    FOREIGN KEY (category_code, user_id) REFERENCES categories(code, user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (project_code, user_id) REFERENCES projects(code, user_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX transactions_user_id_idx ON transactions (user_id);
CREATE INDEX transactions_issued_at_idx ON transactions (issued_at);
CREATE INDEX transactions_category_code_idx ON transactions (category_code);
CREATE INDEX transactions_project_code_idx ON transactions (project_code);
CREATE INDEX transactions_merchant_idx ON transactions (merchant);
CREATE INDEX transactions_name_idx ON transactions (name);
CREATE INDEX transactions_total_idx ON transactions (total);
CREATE INDEX transactions_account_id_idx ON transactions (account_id);
CREATE INDEX transactions_crypto_idx ON transactions (user_id) WHERE (extra ? 'crypto');
CREATE INDEX transactions_applied_rule_idx ON transactions (applied_rule_id) WHERE applied_rule_id IS NOT NULL;

-- ─── Crypto FIFO ledger ─────────────────────────────────────────────────────
--
-- `crypto_lots` tracks open positions per asset in acquisition order. Each
-- purchase or airdrop inserts one lot; disposals decrement `quantity_remaining`
-- FIFO-style and insert `crypto_disposal_matches` rows freezing the realised
-- gain at match time so it survives later edits of the source transaction.

CREATE TABLE crypto_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset text NOT NULL,
    acquired_at timestamp(3) NOT NULL,
    quantity_total numeric(28,12) NOT NULL,
    quantity_remaining numeric(28,12) NOT NULL,
    cost_per_unit_cents bigint NOT NULL,
    fees_cents bigint NOT NULL DEFAULT 0,
    source_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
    asset_class text NOT NULL DEFAULT 'crypto',
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX crypto_lots_user_asset_idx ON crypto_lots (user_id, asset, acquired_at) WHERE quantity_remaining > 0;
CREATE INDEX crypto_lots_user_idx ON crypto_lots (user_id);

CREATE TABLE crypto_disposal_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disposal_transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    lot_id uuid NOT NULL REFERENCES crypto_lots(id) ON DELETE RESTRICT,
    asset text NOT NULL,
    asset_class text NOT NULL DEFAULT 'crypto',
    quantity_consumed numeric(28,12) NOT NULL,
    cost_basis_cents bigint NOT NULL,
    proceeds_cents bigint NOT NULL,
    realized_gain_cents bigint NOT NULL,
    matched_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX crypto_disposal_matches_user_idx ON crypto_disposal_matches (user_id);
CREATE INDEX crypto_disposal_matches_disposal_idx ON crypto_disposal_matches (disposal_transaction_id);
CREATE INDEX crypto_disposal_matches_user_year_idx
    ON crypto_disposal_matches (user_id, (EXTRACT(YEAR FROM matched_at)));

-- ─── Invoicing ───────────────────────────────────────────────────────────────

CREATE TABLE clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text,
    phone text,
    address text,
    tax_id text,
    notes text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX clients_user_id_idx ON clients (user_id);

CREATE TABLE products (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    price integer DEFAULT 0 NOT NULL,
    currency_code text DEFAULT 'EUR' NOT NULL,
    vat_rate double precision DEFAULT 7.0 NOT NULL,
    unit text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX products_user_id_idx ON products (user_id);

CREATE TABLE quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    number text NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    issue_date timestamp(3) NOT NULL,
    expiry_date timestamp(3),
    notes text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX quotes_user_id_idx ON quotes (user_id);

CREATE TABLE quote_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity double precision DEFAULT 1 NOT NULL,
    unit_price integer NOT NULL,
    vat_rate double precision DEFAULT 7.0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    quote_id uuid UNIQUE REFERENCES quotes(id) ON DELETE SET NULL,
    pdf_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
    number text NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    issue_date timestamp(3) NOT NULL,
    due_date timestamp(3),
    paid_at timestamp(3),
    notes text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    irpf_rate double precision DEFAULT 0.0 NOT NULL
);
CREATE INDEX invoices_user_id_idx ON invoices (user_id);
CREATE INDEX invoices_pdf_file_id_idx ON invoices (pdf_file_id) WHERE pdf_file_id IS NOT NULL;

CREATE TABLE invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity double precision DEFAULT 1 NOT NULL,
    unit_price integer NOT NULL,
    vat_rate double precision DEFAULT 7.0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE invoice_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount_cents bigint NOT NULL,
    note text,
    source text DEFAULT 'manual' NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (invoice_id, transaction_id)
);
CREATE INDEX invoice_payments_user_idx ON invoice_payments (user_id);
CREATE INDEX invoice_payments_invoice_idx ON invoice_payments (invoice_id);
CREATE INDEX invoice_payments_transaction_idx ON invoice_payments (transaction_id);

-- ─── Receipt vendor aliases (AI learns vendor→merchant pairings) ────────────

CREATE TABLE receipt_vendor_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_pattern text NOT NULL,
    merchant_pattern text NOT NULL,
    usage_count integer DEFAULT 1 NOT NULL,
    source text DEFAULT 'accept' NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (user_id, vendor_pattern, merchant_pattern)
);
CREATE INDEX receipt_vendor_aliases_user_idx ON receipt_vendor_aliases (user_id);

-- ─── Personal tax: income sources, deductions ──────────────────────────────

CREATE TABLE income_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    name text NOT NULL,
    tax_id text,
    metadata jsonb NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX income_sources_user_kind_idx ON income_sources (user_id, kind);

CREATE TABLE personal_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    tax_year integer NOT NULL,
    amount_cents bigint NOT NULL,
    description text,
    file_id uuid REFERENCES files(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX personal_deductions_user_year_idx ON personal_deductions (user_id, tax_year);

-- ─── Tax filings (per-year/quarter/modelo checklist + status) ──────────────

CREATE TABLE tax_filings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year int NOT NULL,
    quarter int NULL,
    modelo_code text NOT NULL,
    filed_at timestamp(3) NULL,
    checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX tax_filings_unique_idx
    ON tax_filings (user_id, year, COALESCE(quarter, -1), modelo_code);
CREATE INDEX tax_filings_user_year_idx ON tax_filings (user_id, year);

-- ─── Accountant Access ───────────────────────────────────────────────────────

CREATE TABLE accountant_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token text NOT NULL,
    name text NOT NULL,
    email text,
    permissions jsonb DEFAULT '{"tax": true, "time": false, "invoices": true, "transactions": true}' NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp(3),
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX accountant_invites_token_key ON accountant_invites (token);
CREATE INDEX accountant_invites_user_id_idx ON accountant_invites (user_id);
CREATE INDEX accountant_invites_token_idx ON accountant_invites (token);

CREATE TABLE accountant_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    invite_id uuid NOT NULL REFERENCES accountant_invites(id) ON DELETE CASCADE,
    section text NOT NULL,
    ip_address text,
    user_agent text,
    accessed_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX accountant_access_logs_invite_id_idx ON accountant_access_logs (invite_id);
CREATE INDEX accountant_access_logs_invite_id_accessed_at_idx ON accountant_access_logs (invite_id, accessed_at);

CREATE TABLE accountant_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    invite_id uuid NOT NULL REFERENCES accountant_invites(id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    body text NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX accountant_comments_invite_id_idx ON accountant_comments (invite_id);
CREATE INDEX accountant_comments_entity_type_entity_id_idx ON accountant_comments (entity_type, entity_id);

-- ─── Accounts ───────────────────────────────────────────────────────────────

CREATE TABLE accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    bank_name text,
    currency_code text NOT NULL DEFAULT 'EUR',
    account_number text,
    notes text,
    account_type text NOT NULL DEFAULT 'bank',
    -- values: 'bank' | 'credit_card' | 'crypto_exchange' | 'crypto_wallet' | 'cash'
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX accounts_user_id_name_key ON accounts (user_id, name);
CREATE INDEX accounts_user_id_idx ON accounts (user_id);
CREATE INDEX accounts_user_type_idx ON accounts (user_id, account_type) WHERE is_active;

-- ─── Import Sessions ────────────────────────────────────────────────────────

CREATE TABLE import_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    file_name text,
    file_type text,
    row_count integer NOT NULL DEFAULT 0,
    data jsonb NOT NULL DEFAULT '[]',
    column_mapping jsonb,
    status text NOT NULL DEFAULT 'pending',
    suggested_categories jsonb DEFAULT '[]',
    entry_mode text NOT NULL DEFAULT 'csv',
    messages jsonb NOT NULL DEFAULT '[]',
    business_context_snapshot jsonb,
    prompt_version text,
    title text,
    last_activity_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pending_turn_at timestamp(3),
    file_id uuid REFERENCES files(id) ON DELETE SET NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX import_sessions_user_id_idx ON import_sessions (user_id);
CREATE INDEX import_sessions_entry_mode_idx ON import_sessions (entry_mode, status);
CREATE INDEX import_sessions_resumable_idx
    ON import_sessions (user_id, status, last_activity_at DESC)
    WHERE status = 'pending';
CREATE INDEX import_sessions_file_id_idx
    ON import_sessions (file_id)
    WHERE file_id IS NOT NULL;

-- ─── Misc ────────────────────────────────────────────────────────────────────

CREATE TABLE app_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    app text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data jsonb NOT NULL
);
CREATE UNIQUE INDEX app_data_user_id_app_key ON app_data (user_id, app);

CREATE TABLE progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    data jsonb,
    current integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX progress_user_id_idx ON progress (user_id);

-- ─── Categorization Rules ────────────────────────────────────────────────────

CREATE TABLE categorization_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    match_type text NOT NULL DEFAULT 'contains',
    match_field text NOT NULL DEFAULT 'name',
    match_value text NOT NULL,
    category_code text,
    project_code text,
    type text,
    status text,
    note text,
    priority integer DEFAULT 0 NOT NULL,
    source text NOT NULL DEFAULT 'manual',
    confidence double precision DEFAULT 1.0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    match_count integer NOT NULL DEFAULT 0,
    last_applied_at timestamp(3),
    learn_reason text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (category_code, user_id) REFERENCES categories(code, user_id) ON DELETE SET NULL,
    FOREIGN KEY (project_code, user_id) REFERENCES projects(code, user_id) ON DELETE SET NULL
);
CREATE INDEX categorization_rules_user_id_idx ON categorization_rules (user_id);
ALTER TABLE transactions
    ADD CONSTRAINT transactions_applied_rule_fk
    FOREIGN KEY (applied_rule_id) REFERENCES categorization_rules(id) ON DELETE SET NULL;

-- ─── Past Searches ──────────────────────────────────────────────────────────

CREATE TABLE past_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query text NOT NULL,
    topic text NOT NULL,
    results jsonb NOT NULL DEFAULT '[]',
    result_count integer NOT NULL DEFAULT 0,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX past_searches_user_id_idx ON past_searches (user_id);
CREATE INDEX past_searches_user_id_topic_idx ON past_searches (user_id, topic);
CREATE INDEX past_searches_user_id_created_at_idx ON past_searches (user_id, created_at);

-- ─── Wizard: business facts & AI audit trail ───────────────────────────────

CREATE TABLE business_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb NOT NULL,
    source text NOT NULL DEFAULT 'wizard',
    learned_from_session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX business_facts_user_id_key_key ON business_facts (user_id, key);
CREATE INDEX business_facts_user_id_idx ON business_facts (user_id);

CREATE TABLE ai_analysis_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id uuid REFERENCES import_sessions(id) ON DELETE CASCADE,
    transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
    row_index integer,
    provider text NOT NULL,
    model text,
    prompt_version text NOT NULL,
    reasoning text,
    category_code text,
    project_code text,
    suggested_status text,
    confidence jsonb NOT NULL,
    clarifying_question text,
    tokens_used integer,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX ai_analysis_results_session_idx ON ai_analysis_results (session_id);
CREATE INDEX ai_analysis_results_transaction_idx ON ai_analysis_results (transaction_id);
CREATE INDEX ai_analysis_results_user_idx ON ai_analysis_results (user_id);

-- ─── Wizard: knowledge packs (curated tax domain content) ──────────────────

CREATE TABLE knowledge_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    source_prompt text,
    last_refreshed_at timestamp(3),
    refresh_interval_days integer NOT NULL DEFAULT 30,
    provider text,
    model text,
    review_status text NOT NULL DEFAULT 'verified',
    refresh_state text NOT NULL DEFAULT 'idle',
    refresh_message text,
    refresh_started_at timestamp(3),
    refresh_finished_at timestamp(3),
    refresh_heartbeat_at timestamp(3),
    pending_review_content text,
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX knowledge_packs_user_slug_key ON knowledge_packs (user_id, slug);
CREATE INDEX knowledge_packs_user_idx ON knowledge_packs (user_id);

-- ─── Chat ────────────────────────────────────────────────────────────────────

CREATE TABLE chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    status text NOT NULL DEFAULT 'sent',
    applied_at timestamp(3),
    created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX chat_messages_user_created_idx ON chat_messages (user_id, created_at);
CREATE UNIQUE INDEX chat_messages_user_summary_idx ON chat_messages (user_id) WHERE role = 'system';

-- ─── Schema Version ─────────────────────────────────────────────────────────

CREATE TABLE schema_version (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version integer NOT NULL DEFAULT 3,
    migrated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO schema_version (id, version) VALUES (1, 7);
