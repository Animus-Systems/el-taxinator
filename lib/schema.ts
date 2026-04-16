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

const SCHEMA_VERSION = 10 // bump this when adding a migration

const migrations: { version: number; description: string; sql: string }[] = [
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
    "files", "transactions", "app_data", "progress", "clients", "products",
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
