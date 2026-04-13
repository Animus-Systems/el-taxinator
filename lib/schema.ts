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

const SCHEMA_VERSION = 4 // bump this when adding a migration

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
    return result.rows[0]?.has_users === true
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
    "quotes", "quote_items", "invoices", "invoice_items", "time_entries",
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
  return result.rows[0]?.version ?? 1
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

export async function ensureSchema(pool: Pool, userId?: string): Promise<SchemaResult> {
  const connId = (pool as any).options?.connectionString ?? "default"

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

  schemaChecked.add(connId)
  return result
}
