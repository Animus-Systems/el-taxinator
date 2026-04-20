import type { Pool } from "pg"
import fs from "fs"
import path from "path"

// ---------------------------------------------------------------------------
// Schema version & migrations
// ---------------------------------------------------------------------------
//
// Each migration has a version number and SQL to run. When connecting to an
// existing database, we check the current version and run any pending
// migrations. Fresh databases get the full schema.sql + version set to latest.
//
// To add a new migration:
// 1. Add the change to schema.sql (so fresh databases get it)
// 2. Add a migration entry here with the next version number
// 3. The migration SQL should be idempotent (use IF NOT EXISTS, etc.)

export const SCHEMA_VERSION = 29 // bump this when adding a migration

export const migrations: { version: number; description: string; sql: string }[] = [
  {
    version: 2,
    description: "Add accounts, import_sessions tables and account_id on transactions",
    sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        bank_name text,
        currency_code text NOT NULL DEFAULT 'EUR',
        account_number text,
        notes text,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_id_name_key ON accounts (user_id, name);
      CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);

      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions (account_id);

      CREATE TABLE IF NOT EXISTS import_sessions (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        row_count integer NOT NULL DEFAULT 0,
        data jsonb NOT NULL DEFAULT '[]',
        column_mapping jsonb,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS import_sessions_user_id_idx ON import_sessions (user_id);
    `,
  },
  {
    version: 3,
    description: "Add categorization rules, category tax refs, import session suggested categories",
    sql: `
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS tax_form_ref text;
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
      ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS suggested_categories jsonb DEFAULT '[]';
      CREATE TABLE IF NOT EXISTS categorization_rules (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        match_type text NOT NULL DEFAULT 'contains',
        match_field text NOT NULL DEFAULT 'name',
        match_value text NOT NULL,
        category_code text,
        project_code text,
        type text,
        note text,
        priority integer DEFAULT 0 NOT NULL,
        source text NOT NULL DEFAULT 'manual',
        confidence double precision DEFAULT 1.0 NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (category_code, user_id) REFERENCES categories(code, user_id) ON DELETE SET NULL,
        FOREIGN KEY (project_code, user_id) REFERENCES projects(code, user_id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS categorization_rules_user_id_idx ON categorization_rules (user_id);
    `,
  },
  {
    version: 4,
    description: "Add past_searches table for storing and comparing search results",
    sql: `
      CREATE TABLE IF NOT EXISTS past_searches (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        query text NOT NULL,
        topic text NOT NULL,
        results jsonb NOT NULL DEFAULT '[]',
        result_count integer NOT NULL DEFAULT 0,
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS past_searches_user_id_idx ON past_searches (user_id);
      CREATE INDEX IF NOT EXISTS past_searches_user_id_topic_idx ON past_searches (user_id, topic);
      CREATE INDEX IF NOT EXISTS past_searches_user_id_created_at_idx ON past_searches (user_id, created_at);
    `,
  },
  {
    version: 5,
    description: "Add transaction status and rule status suggestion fields",
    sql: `
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'business';

      ALTER TABLE categorization_rules
      ADD COLUMN IF NOT EXISTS status text;
    `,
  },
  {
    version: 6,
    description: "Wizard: conversational sessions, business facts, AI audit trail, entity_type",
    sql: `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS entity_type text;

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'csv';

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]';

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS business_context_snapshot jsonb;

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS prompt_version text;

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS title text;

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS last_activity_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE import_sessions
      ADD COLUMN IF NOT EXISTS pending_turn_at timestamp(3);

      ALTER TABLE import_sessions
      ALTER COLUMN file_name DROP NOT NULL;

      ALTER TABLE import_sessions
      ALTER COLUMN file_type DROP NOT NULL;

      CREATE INDEX IF NOT EXISTS import_sessions_entry_mode_idx
        ON import_sessions (entry_mode, status);

      CREATE INDEX IF NOT EXISTS import_sessions_resumable_idx
        ON import_sessions (user_id, status, last_activity_at DESC)
        WHERE status = 'pending';

      CREATE TABLE IF NOT EXISTS business_facts (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key text NOT NULL,
        value jsonb NOT NULL,
        source text NOT NULL DEFAULT 'wizard',
        learned_from_session_id uuid REFERENCES import_sessions(id) ON DELETE SET NULL,
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS business_facts_user_id_key_key ON business_facts (user_id, key);
      CREATE INDEX IF NOT EXISTS business_facts_user_id_idx ON business_facts (user_id);

      CREATE TABLE IF NOT EXISTS ai_analysis_results (
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
      CREATE INDEX IF NOT EXISTS ai_analysis_results_session_idx ON ai_analysis_results (session_id);
      CREATE INDEX IF NOT EXISTS ai_analysis_results_transaction_idx ON ai_analysis_results (transaction_id);
      CREATE INDEX IF NOT EXISTS ai_analysis_results_user_idx ON ai_analysis_results (user_id);
    `,
  },
  {
    version: 7,
    description: "Wizard: knowledge packs (curated tax domain content, LLM-refreshable)",
    sql: `
      CREATE TABLE IF NOT EXISTS knowledge_packs (
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
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS knowledge_packs_user_slug_key ON knowledge_packs (user_id, slug);
      CREATE INDEX IF NOT EXISTS knowledge_packs_user_idx ON knowledge_packs (user_id);
    `,
  },
  {
    version: 8,
    description: "Crypto: account_type column + crypto transactions partial index",
    sql: `
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'bank';

      CREATE INDEX IF NOT EXISTS accounts_user_type_idx
        ON accounts (user_id, account_type)
        WHERE is_active;

      CREATE INDEX IF NOT EXISTS transactions_crypto_idx
        ON transactions (user_id)
        WHERE (extra ? 'crypto');
    `,
  },
  {
    version: 9,
    description: "Crypto FIFO ledger: crypto_lots + crypto_disposal_matches",
    sql: `
      CREATE TABLE IF NOT EXISTS crypto_lots (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset text NOT NULL,
        acquired_at timestamp(3) NOT NULL,
        quantity_total numeric(28,12) NOT NULL,
        quantity_remaining numeric(28,12) NOT NULL,
        cost_per_unit_cents bigint NOT NULL,
        fees_cents bigint NOT NULL DEFAULT 0,
        source_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS crypto_lots_user_asset_idx
        ON crypto_lots (user_id, asset, acquired_at)
        WHERE quantity_remaining > 0;
      CREATE INDEX IF NOT EXISTS crypto_lots_user_idx ON crypto_lots (user_id);

      CREATE TABLE IF NOT EXISTS crypto_disposal_matches (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        disposal_transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        lot_id uuid NOT NULL REFERENCES crypto_lots(id) ON DELETE RESTRICT,
        asset text NOT NULL,
        quantity_consumed numeric(28,12) NOT NULL,
        cost_basis_cents bigint NOT NULL,
        proceeds_cents bigint NOT NULL,
        realized_gain_cents bigint NOT NULL,
        matched_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS crypto_disposal_matches_user_idx
        ON crypto_disposal_matches (user_id);
      CREATE INDEX IF NOT EXISTS crypto_disposal_matches_disposal_idx
        ON crypto_disposal_matches (disposal_transaction_id);
      CREATE INDEX IF NOT EXISTS crypto_disposal_matches_user_year_idx
        ON crypto_disposal_matches (user_id, (EXTRACT(YEAR FROM matched_at)));
    `,
  },
  {
    version: 10,
    description: "Drop time_entries table; link import_sessions to files",
    sql: `
      DROP TABLE IF EXISTS time_entries CASCADE;

      ALTER TABLE import_sessions
        ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES files(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS import_sessions_file_id_idx
        ON import_sessions (file_id)
        WHERE file_id IS NOT NULL;
    `,
  },
  {
    version: 11,
    description: "Link invoices to uploaded PDF file",
    sql: `
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS pdf_file_id uuid REFERENCES files(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS invoices_pdf_file_id_idx
        ON invoices (pdf_file_id)
        WHERE pdf_file_id IS NOT NULL;
    `,
  },
  {
    version: 12,
    description: "Give updated_at columns a CURRENT_TIMESTAMP default",
    sql: `
      ALTER TABLE clients             ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE products            ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE quotes              ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE invoices            ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE accountant_invites  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE accountant_comments ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
    `,
  },
  {
    version: 13,
    description: "Invoice ↔ transaction allocation table",
    sql: `
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        amount_cents bigint NOT NULL,
        note text,
        source text NOT NULL DEFAULT 'manual',
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE (invoice_id, transaction_id)
      );
      CREATE INDEX IF NOT EXISTS invoice_payments_user_idx
        ON invoice_payments (user_id);
      CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx
        ON invoice_payments (invoice_id);
      CREATE INDEX IF NOT EXISTS invoice_payments_transaction_idx
        ON invoice_payments (transaction_id);
    `,
  },
  {
    version: 14,
    description: "Receipt vendor aliases (AI learns vendor→merchant pairings)",
    sql: `
      CREATE TABLE IF NOT EXISTS receipt_vendor_aliases (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vendor_pattern text NOT NULL,
        merchant_pattern text NOT NULL,
        usage_count integer NOT NULL DEFAULT 1,
        source text NOT NULL DEFAULT 'accept',
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE (user_id, vendor_pattern, merchant_pattern)
      );
      CREATE INDEX IF NOT EXISTS receipt_vendor_aliases_user_idx
        ON receipt_vendor_aliases (user_id);
    `,
  },
  {
    version: 15,
    description: "Personal tax: income sources, deductions, transaction→source FK, investment asset_class",
    sql: `
      CREATE TABLE IF NOT EXISTS income_sources (
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
      CREATE INDEX IF NOT EXISTS income_sources_user_kind_idx
        ON income_sources (user_id, kind);

      CREATE TABLE IF NOT EXISTS personal_deductions (
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
      CREATE INDEX IF NOT EXISTS personal_deductions_user_year_idx
        ON personal_deductions (user_id, tax_year);

      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS income_source_id uuid
          REFERENCES income_sources(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS transactions_income_source_idx
        ON transactions (income_source_id)
        WHERE income_source_id IS NOT NULL;

      ALTER TABLE crypto_lots
        ADD COLUMN IF NOT EXISTS asset_class text NOT NULL DEFAULT 'crypto';
      ALTER TABLE crypto_disposal_matches
        ADD COLUMN IF NOT EXISTS asset_class text NOT NULL DEFAULT 'crypto';
    `,
  },
  {
    version: 16,
    description: "Rules audit trail (hit counts, last_applied, learn_reason) + transaction→rule link + knowledge pending_review preservation",
    sql: `
      ALTER TABLE categorization_rules
        ADD COLUMN IF NOT EXISTS match_count integer NOT NULL DEFAULT 0;
      ALTER TABLE categorization_rules
        ADD COLUMN IF NOT EXISTS last_applied_at timestamp(3);
      ALTER TABLE categorization_rules
        ADD COLUMN IF NOT EXISTS learn_reason text;

      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS applied_rule_id uuid
          REFERENCES categorization_rules(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS transactions_applied_rule_idx
        ON transactions (applied_rule_id)
        WHERE applied_rule_id IS NOT NULL;

      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS pending_review_content text;
    `,
  },
  {
    version: 17,
    description: "Knowledge refresh job state and observability columns",
    sql: `
      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS refresh_state text NOT NULL DEFAULT 'idle';
      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS refresh_message text;
      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS refresh_started_at timestamp(3);
      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS refresh_finished_at timestamp(3);
      ALTER TABLE knowledge_packs
        ADD COLUMN IF NOT EXISTS refresh_heartbeat_at timestamp(3);
    `,
  },
  {
    version: 18,
    description: "Show transaction type column by default for existing users",
    sql: `
      UPDATE fields SET is_visible_in_list = true WHERE code = 'type';
    `,
  },
  {
    version: 19,
    description: "Chat messages table with rolling summary support",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        content text NOT NULL,
        metadata jsonb,
        status text NOT NULL DEFAULT 'sent',
        applied_at timestamp(3),
        created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx
        ON chat_messages (user_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_user_summary_idx
        ON chat_messages (user_id) WHERE role = 'system';
    `,
  },
  {
    version: 20,
    description: "Tax filings table (per-user, per-year/quarter/modelo checklist + status)",
    sql: `
      CREATE TABLE IF NOT EXISTS tax_filings (
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
      CREATE UNIQUE INDEX IF NOT EXISTS tax_filings_unique_idx
        ON tax_filings (user_id, year, COALESCE(quarter, -1), modelo_code);
      CREATE INDEX IF NOT EXISTS tax_filings_user_year_idx
        ON tax_filings (user_id, year);
    `,
  },
  {
    version: 21,
    description: "First-class transfers: add transfer_id, counter_account_id, transfer_direction columns and retrofit existing same-day opposite-sign same-amount pairs",
    sql: `
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS transfer_id uuid,
        ADD COLUMN IF NOT EXISTS counter_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS transfer_direction text;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'transactions' AND constraint_name = 'transactions_transfer_direction_check'
        ) THEN
          ALTER TABLE transactions
            ADD CONSTRAINT transactions_transfer_direction_check
            CHECK (transfer_direction IN ('outgoing', 'incoming') OR transfer_direction IS NULL);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS transactions_transfer_id_idx
        ON transactions (transfer_id) WHERE transfer_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS transactions_orphan_transfer_idx
        ON transactions (user_id, issued_at)
        WHERE type = 'transfer' AND transfer_id IS NULL;

      -- Retrofit: pair same-day same-amount opposite-sign rows. Conservative —
      -- same-day only (not ±1 day like runtime) to minimize false positives.
      CREATE TEMP TABLE _transfer_pairs ON COMMIT DROP AS
      WITH candidates AS (
        SELECT
          o.id AS outgoing_id,
          i.id AS incoming_id,
          o.account_id AS outgoing_account_id,
          i.account_id AS incoming_account_id,
          ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY i.issued_at, i.id) AS rn_o,
          ROW_NUMBER() OVER (PARTITION BY i.id ORDER BY o.issued_at, o.id) AS rn_i
        FROM transactions o
        JOIN transactions i
          ON o.user_id = i.user_id
         AND o.account_id <> i.account_id
         AND ABS(o.total) = ABS(i.total)
         AND o.currency_code = i.currency_code
         AND o.issued_at::date = i.issued_at::date
         AND o.type = 'expense'
         AND i.type = 'income'
         AND o.transfer_id IS NULL
         AND i.transfer_id IS NULL
      )
      SELECT outgoing_id, incoming_id, outgoing_account_id, incoming_account_id,
             gen_random_uuid() AS transfer_id
      FROM candidates
      WHERE rn_o = 1 AND rn_i = 1;

      UPDATE transactions t
      SET type = 'transfer',
          transfer_id = p.transfer_id,
          transfer_direction = 'outgoing',
          counter_account_id = p.incoming_account_id,
          extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object('preMigrationType', 'expense')
      FROM _transfer_pairs p
      WHERE t.id = p.outgoing_id;

      UPDATE transactions t
      SET type = 'transfer',
          transfer_id = p.transfer_id,
          transfer_direction = 'incoming',
          counter_account_id = p.outgoing_account_id,
          extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object('preMigrationType', 'income')
      FROM _transfer_pairs p
      WHERE t.id = p.incoming_id;
    `,
  },
  {
    version: 22,
    description: "Broader transfer retrofit: pair own-account movements by transfer-specific name patterns (type='other' outgoing legs that v21 missed)",
    sql: `
      -- v21 only paired rows where outgoing.type='expense' AND incoming.type='income'.
      -- In practice, AI-classified own-account transfers often landed as type='other'
      -- on the outgoing side, so v21 missed them. This migration pairs same-day
      -- same-amount opposite-account rows where the NAME clearly indicates a
      -- self-transfer (Transferencia saliente/entrante, Transfer sent/received,
      -- "Sent from <bank>", "Received from <bank>") and both sides are marked
      -- status='personal_ignored'. The status gate + keyword gate together prevent
      -- false positives like same-amount Bizum payments from different people.

      CREATE TEMP TABLE _transfer_pairs_v22 ON COMMIT DROP AS
      WITH candidates AS (
        SELECT
          o.id AS outgoing_id,
          i.id AS incoming_id,
          o.account_id AS outgoing_account_id,
          i.account_id AS incoming_account_id,
          o.type AS outgoing_type,
          i.type AS incoming_type,
          ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY i.issued_at, i.id) AS rn_o,
          ROW_NUMBER() OVER (PARTITION BY i.id ORDER BY o.issued_at, o.id) AS rn_i
        FROM transactions o
        JOIN transactions i
          ON o.user_id = i.user_id
         AND o.account_id <> i.account_id
         AND ABS(o.total) = ABS(i.total)
         AND o.currency_code = i.currency_code
         AND o.issued_at::date = i.issued_at::date
         AND o.status = 'personal_ignored'
         AND i.status = 'personal_ignored'
         AND o.transfer_id IS NULL
         AND i.transfer_id IS NULL
         AND o.type IN ('expense', 'other')
         AND i.type IN ('income', 'other')
         -- outgoing side mentions a transfer-specific keyword
         AND (
           o.name ILIKE '%transferencia saliente%'
           OR o.name ILIKE '%transfer sent%'
           OR o.name ILIKE '%transferencia a%'
           OR o.name ILIKE '%sent to%'
         )
         -- and/or incoming side mentions one
         AND (
           i.name ILIKE '%transferencia entrante%'
           OR i.name ILIKE '%transfer received%'
           OR i.name ILIKE '%sent from%'
           OR i.name ILIKE '%received from%'
           OR i.name ILIKE '%transferencia recibida%'
         )
      )
      SELECT outgoing_id, incoming_id, outgoing_account_id, incoming_account_id,
             outgoing_type, incoming_type,
             gen_random_uuid() AS transfer_id
      FROM candidates
      WHERE rn_o = 1 AND rn_i = 1;

      UPDATE transactions t
      SET type = 'transfer',
          transfer_id = p.transfer_id,
          transfer_direction = 'outgoing',
          counter_account_id = p.incoming_account_id,
          extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object('preMigrationType', p.outgoing_type)
      FROM _transfer_pairs_v22 p
      WHERE t.id = p.outgoing_id;

      UPDATE transactions t
      SET type = 'transfer',
          transfer_id = p.transfer_id,
          transfer_direction = 'incoming',
          counter_account_id = p.outgoing_account_id,
          extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object('preMigrationType', p.incoming_type)
      FROM _transfer_pairs_v22 p
      WHERE t.id = p.incoming_id;
    `,
  },
  {
    version: 23,
    description: "FX conversion support: add realized_fx_gain_cents and permit type='conversion'",
    sql: `
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS realized_fx_gain_cents integer;
    `,
  },
  {
    version: 24,
    description: "import_sessions.context_file_ids — supplementary files attached to a session, injected into wizard prompts",
    sql: `
      ALTER TABLE import_sessions
        ADD COLUMN IF NOT EXISTS context_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
    `,
  },
  {
    version: 25,
    description: "Backfill crypto_* categories for users who seeded before they existed",
    sql: `
      INSERT INTO categories (id, user_id, code, name, color, llm_prompt, tax_form_ref, is_default)
      SELECT gen_random_uuid(), u.id, c.code, c.name::jsonb, '#6B7280', c.llm_prompt, c.tax_form_ref, true
      FROM users u
      CROSS JOIN (VALUES
        ('crypto_disposal',
         '{"en":"Crypto Disposal","es":"Disposición de criptomoneda"}',
         'Sale, withdrawal, or exchange of crypto into fiat or another asset. Triggered by merchants like Swissborg, Coinbase, Binance, Kraken, Bitstamp, Bit2Me, Bitpanda, Crypto.com, Revolut crypto, or any account with account_type crypto_exchange/crypto_wallet.',
         'Ganancia patrimonial — base del ahorro (Modelo 100) / Modelo 200 SL'),
        ('crypto_purchase',
         '{"en":"Crypto Purchase","es":"Compra de criptomoneda"}',
         'Buying crypto with fiat — not a taxable event, but builds cost basis for FIFO tracking.',
         'Coste de adquisición (FIFO, no deducible directo)'),
        ('crypto_fee',
         '{"en":"Crypto Network Fee","es":"Comisión de red/exchange"}',
         'Network gas fees, exchange trading fees, withdrawal fees on crypto platforms.',
         'Coste asociado al activo'),
        ('crypto_staking_reward',
         '{"en":"Staking Reward","es":"Recompensa de staking"}',
         'Staking rewards, lending interest, yield farming, liquidity provision payouts.',
         'Rendimiento del capital mobiliario (Modelo 100)'),
        ('crypto_airdrop',
         '{"en":"Airdrop","es":"Airdrop"}',
         'Free token airdrops, hard-fork distributions, free NFTs. Taxed at fair market value on receipt.',
         'Ganancia patrimonial sin valor de adquisición')
      ) AS c(code, name, llm_prompt, tax_form_ref)
      ON CONFLICT (user_id, code) DO NOTHING;
    `,
  },
  {
    version: 26,
    description: "Add structured past-filing fields to tax_filings (amount, confirmation, source)",
    sql: `
      ALTER TABLE tax_filings
        ADD COLUMN IF NOT EXISTS filed_amount_cents bigint,
        ADD COLUMN IF NOT EXISTS confirmation_number text,
        ADD COLUMN IF NOT EXISTS filing_source text;
    `,
  },
  {
    version: 27,
    description: "Rename clients→contacts so invoices AND the new purchases surface can share one contact entity",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
          ALTER TABLE clients RENAME TO contacts;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'client_id') THEN
          ALTER TABLE invoices RENAME COLUMN client_id TO contact_id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'client_id') THEN
          ALTER TABLE quotes RENAME COLUMN client_id TO contact_id;
        END IF;
      END $$;
      ALTER INDEX IF EXISTS clients_user_id_idx RENAME TO contacts_user_id_idx;
    `,
  },
  {
    version: 28,
    description: "Expand contacts with address detail (mobile, city, postal_code, province, country), bank_details, role (client/supplier/both) and kind (company/person)",
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
          RETURN;  -- nothing to do on minimal test schemas that don't have contacts
        END IF;
        ALTER TABLE contacts
          ADD COLUMN IF NOT EXISTS mobile text,
          ADD COLUMN IF NOT EXISTS city text,
          ADD COLUMN IF NOT EXISTS postal_code text,
          ADD COLUMN IF NOT EXISTS province text,
          ADD COLUMN IF NOT EXISTS country text,
          ADD COLUMN IF NOT EXISTS bank_details text,
          ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client',
          ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'company';
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'contacts' AND constraint_name = 'contacts_role_check'
        ) THEN
          ALTER TABLE contacts
            ADD CONSTRAINT contacts_role_check
            CHECK (role IN ('client', 'supplier', 'both'));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'contacts' AND constraint_name = 'contacts_kind_check'
        ) THEN
          ALTER TABLE contacts
            ADD CONSTRAINT contacts_kind_check
            CHECK (kind IN ('company', 'person'));
        END IF;
      END $$;
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
          CREATE INDEX IF NOT EXISTS contacts_user_role_idx ON contacts (user_id, role);
        END IF;
      END $$;
    `,
  },
  {
    version: 29,
    description: "Purchases domain: supplier invoices (libro de facturas recibidas), line items and payment allocations against transactions",
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
          RETURN;  -- skip on minimal test schemas (purchases depends on contacts + transactions + files)
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
          RETURN;
        END IF;

        CREATE TABLE IF NOT EXISTS purchases (
          id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
          pdf_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
          supplier_invoice_number text NOT NULL,
          status text DEFAULT 'received' NOT NULL,
          issue_date timestamp(3) NOT NULL,
          due_date timestamp(3),
          paid_at timestamp(3),
          currency_code text NOT NULL DEFAULT 'EUR',
          irpf_rate double precision DEFAULT 0.0 NOT NULL,
          notes text,
          created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases (user_id);
        CREATE INDEX IF NOT EXISTS purchases_contact_id_idx ON purchases (contact_id) WHERE contact_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS purchases_user_status_idx ON purchases (user_id, status);
        CREATE INDEX IF NOT EXISTS purchases_user_issue_date_idx ON purchases (user_id, issue_date);

        CREATE TABLE IF NOT EXISTS purchase_items (
          id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
          purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
          product_id uuid REFERENCES products(id) ON DELETE SET NULL,
          description text NOT NULL,
          quantity double precision DEFAULT 1 NOT NULL,
          unit_price integer NOT NULL,
          vat_rate double precision DEFAULT 0 NOT NULL,
          "position" integer DEFAULT 0 NOT NULL
        );
        CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx ON purchase_items (purchase_id);

        CREATE TABLE IF NOT EXISTS purchase_payments (
          id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
          transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          amount_cents bigint NOT NULL,
          note text,
          source text DEFAULT 'manual' NOT NULL,
          created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE (purchase_id, transaction_id)
        );
        CREATE INDEX IF NOT EXISTS purchase_payments_user_idx ON purchase_payments (user_id);
        CREATE INDEX IF NOT EXISTS purchase_payments_purchase_idx ON purchase_payments (purchase_id);
        CREATE INDEX IF NOT EXISTS purchase_payments_transaction_idx ON purchase_payments (transaction_id);
      END $$;
    `,
  },
]

// ---------------------------------------------------------------------------
// Core schema functions
// ---------------------------------------------------------------------------

/**
 * Check if a database has the Taxinator schema (users table exists).
 */
export async function hasSchema(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      ) AS has_users`
    )
    return result.rows[0]?.["has_users"] === true
  } catch {
    return false
  }
}

/**
 * Apply the Taxinator schema to a fresh database.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const schemaFile = path.join(process.cwd(), "schema.sql")

  if (!fs.existsSync(schemaFile)) {
    throw new Error("Schema file not found at schema.sql")
  }

  const sql = fs.readFileSync(schemaFile, "utf-8")
  await pool.query(sql)

  // Set version to latest since fresh databases have everything
  await ensureVersionTable(pool)
  await pool.query(
    `INSERT INTO schema_version (version) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET version = $1, migrated_at = now()`,
    [SCHEMA_VERSION],
  )
}

/**
 * Ensure all id columns have DEFAULT gen_random_uuid().
 * Fixes databases created by old Prisma migrations that lacked these defaults.
 */
async function ensureDefaults(pool: Pool): Promise<void> {
  const tables = [
    "users", "settings", "categories", "projects", "fields", "currencies",
    "files", "transactions", "app_data", "progress", "contacts", "products",
    "quotes", "quote_items", "invoices", "invoice_items",
    "accountant_invites", "accountant_access_logs", "accountant_comments",
    "sessions", "account", "verification", "past_searches",
  ]

  for (const table of tables) {
    try {
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`)
    } catch {}
  }

  for (const table of ["users", "transactions"]) {
    try {
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP`)
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

async function ensureVersionTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      version integer NOT NULL DEFAULT 1,
      migrated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `)
  // Ensure there's always a row
  await pool.query(`
    INSERT INTO schema_version (id, version) VALUES (1, 1)
    ON CONFLICT (id) DO NOTHING
  `)
}

async function getCurrentVersion(pool: Pool): Promise<number> {
  await ensureVersionTable(pool)
  const result = await pool.query(`SELECT version FROM schema_version WHERE id = 1`)
  return (result.rows[0]?.["version"] as number | undefined) ?? 1
}

async function runMigrations(pool: Pool): Promise<{ ran: number; from: number; to: number }> {
  const currentVersion = await getCurrentVersion(pool)

  if (currentVersion >= SCHEMA_VERSION) {
    return { ran: 0, from: currentVersion, to: currentVersion }
  }

  const pending = migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    console.log(`[schema] Running migration v${migration.version}: ${migration.description}`)
    await pool.query(migration.sql)
    await pool.query(
      `UPDATE schema_version SET version = $1, migrated_at = now() WHERE id = 1`,
      [migration.version],
    )
  }

  return { ran: pending.length, from: currentVersion, to: SCHEMA_VERSION }
}

// Track which databases have been checked (per process lifetime)
const schemaChecked = new Set<string>()

/**
 * Ensure a database has the Taxinator schema, proper defaults, and is
 * up-to-date with all migrations. Safe to call on every connection.
 */
export type SchemaResult = {
  status: "fresh" | "migrated" | "up_to_date"
  migrationsRan?: number
  fromVersion?: number
  toVersion?: number
  descriptions?: string[]
}

export async function ensureSchema(pool: Pool, _userId?: string): Promise<SchemaResult> {
  const poolWithOptions = pool as Pool & { options?: { connectionString?: string } }
  const connId = poolWithOptions.options?.connectionString ?? "default"

  if (schemaChecked.has(connId)) return { status: "up_to_date" }

  let result: SchemaResult

  if (await hasSchema(pool)) {
    await ensureDefaults(pool)
    const { ran, from, to } = await runMigrations(pool)
    if (ran > 0) {
      const descriptions = migrations
        .filter(m => m.version > from && m.version <= to)
        .map(m => m.description)
      console.log(`[schema] Migrated from v${from} to v${to} (${ran} migration${ran > 1 ? "s" : ""})`)
      result = { status: "migrated", migrationsRan: ran, fromVersion: from, toVersion: to, descriptions }
    } else {
      result = { status: "up_to_date" }
    }
  } else {
    await applySchema(pool)
    result = { status: "fresh" }
  }

  await syncEntityTypeFromEntitiesJson(pool)
  schemaChecked.add(connId)
  return result
}

/**
 * Mirror the active entity's `type` from entities.json onto users.entity_type
 * for any user whose column is currently NULL. The wizard prompts read this
 * column so they can address the user as autónomo or SL without re-reading
 * the JSON file on every request.
 *
 * Per CLAUDE.md "one database per entity" — every user in this database
 * belongs to the same entity, so a single bulk UPDATE is safe.
 */
async function syncEntityTypeFromEntitiesJson(pool: Pool): Promise<void> {
  try {
    // Lazy import to avoid pulling embedded-pg into modules that only need schema.
    const { getRunningClusterEntityId } = await import("./embedded-pg")
    const { getEntityById } = await import("./entities")
    const entityId = getRunningClusterEntityId()
    if (!entityId) return
    const entity = getEntityById(entityId)
    if (!entity) return
    await pool.query(
      `UPDATE users SET entity_type = $1 WHERE entity_type IS NULL`,
      [entity.type],
    )
  } catch (err) {
    // Non-fatal: prompts will fall back to "(entity type not yet known)".
    console.warn("[schema] entity_type sync skipped:", err instanceof Error ? err.message : err)
  }
}
