import type pg from "pg"
import fs from "fs"
import path from "path"

/**
 * Check if a database has the Taxinator schema (users table exists).
 */
export async function hasSchema(pool: pg.Pool): Promise<boolean> {
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
export async function applySchema(pool: pg.Pool): Promise<void> {
  const schemaFile = path.join(process.cwd(), "schema.sql")

  if (!fs.existsSync(schemaFile)) {
    throw new Error("Schema file not found at schema.sql")
  }

  const sql = fs.readFileSync(schemaFile, "utf-8")
  await pool.query(sql)
}

/**
 * Ensure all id columns have DEFAULT gen_random_uuid().
 * Fixes databases created by old Prisma migrations that lacked these defaults.
 */
async function ensureDefaults(pool: pg.Pool): Promise<void> {
  const tables = [
    "users", "settings", "categories", "projects", "fields", "currencies",
    "files", "transactions", "app_data", "progress", "clients", "products",
    "quotes", "quote_items", "invoices", "invoice_items", "time_entries",
    "accountant_invites", "accountant_access_logs", "accountant_comments",
    "sessions", "account", "verification",
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

// Track which databases have had defaults ensured (per process lifetime)
const defaultsApplied = new Set<string>()

/**
 * Ensure a database has the Taxinator schema and proper defaults.
 * Defaults are only applied once per database per process lifetime.
 */
export async function ensureSchema(pool: pg.Pool): Promise<void> {
  const connId = (pool as any).options?.connectionString ?? "default"

  if (await hasSchema(pool)) {
    if (!defaultsApplied.has(connId)) {
      await ensureDefaults(pool)
      defaultsApplied.add(connId)
    }
    return
  }
  await applySchema(pool)
  defaultsApplied.add(connId)
}
