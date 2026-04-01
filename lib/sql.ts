import type { PoolClient } from "pg"
import { getPool } from "@/lib/pg"
import { randomUUID } from "crypto"

// ---------------------------------------------------------------------------
// Case converters
// ---------------------------------------------------------------------------

/** Converts a snake_case string to camelCase. */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())
}

/** Converts a camelCase string to snake_case. */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * Converts a PostgreSQL row with snake_case columns to a camelCase object.
 *
 * Handles:
 * - snake_case -> camelCase key conversion
 * - PostgreSQL timestamp strings -> Date objects
 * - JSON string columns -> parsed objects
 * - null values preserved as-is
 */
export function mapRow<T>(row: Record<string, unknown>): T {
  const mapped: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key)

    if (value === null || value === undefined) {
      mapped[camelKey] = value
    } else if (value instanceof Date) {
      mapped[camelKey] = value
    } else if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
    ) {
      // ISO timestamp string from PostgreSQL
      mapped[camelKey] = new Date(value)
    } else if (typeof value === "string" && isJsonString(value)) {
      try {
        mapped[camelKey] = JSON.parse(value)
      } catch {
        mapped[camelKey] = value
      }
    } else {
      mapped[camelKey] = value
    }
  }

  return mapped as T
}

function isJsonString(str: string): boolean {
  const trimmed = str.trim()
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  )
}

// ---------------------------------------------------------------------------
// Tagged template literal for parameterized queries
// ---------------------------------------------------------------------------

export interface SqlQuery {
  text: string
  values: unknown[]
}

/**
 * Tagged template literal that creates parameterized queries.
 *
 * @example
 * const q = sql`SELECT * FROM users WHERE id = ${userId} AND email = ${email}`
 * // { text: "SELECT * FROM users WHERE id = $1 AND email = $2", values: [userId, email] }
 */
export function sql(strings: TemplateStringsArray, ...params: unknown[]): SqlQuery {
  const values: unknown[] = []
  let text = ""

  for (let i = 0; i < strings.length; i++) {
    text += strings[i]
    if (i < params.length) {
      values.push(params[i])
      text += `$${values.length}`
    }
  }

  return { text, values }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Executes a query and returns all rows mapped to camelCase.
 */
export async function queryMany<T>(query: SqlQuery): Promise<T[]> {
  const pool = await getPool()
  const result = await pool.query(query.text, query.values)
  return result.rows.map((row) => mapRow<T>(row))
}

/**
 * Executes a query and returns the first row mapped to camelCase, or null.
 */
export async function queryOne<T>(query: SqlQuery): Promise<T | null> {
  const pool = await getPool()
  const result = await pool.query(query.text, query.values)
  if (result.rows.length === 0) return null
  return mapRow<T>(result.rows[0])
}

/**
 * Executes a write query and returns the number of affected rows.
 */
export async function execute(query: SqlQuery): Promise<number> {
  const pool = await getPool()
  const result = await pool.query(query.text, query.values)
  return result.rowCount ?? 0
}

// ---------------------------------------------------------------------------
// Transaction wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a callback in BEGIN / COMMIT with automatic ROLLBACK on error.
 *
 * The callback receives a dedicated PoolClient that must be used for all
 * queries within the transaction.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

/** Matches valid SQL identifiers (letters, digits, underscores). */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function assertSafeIdentifier(name: string, context: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe ${context}: ${name}`)
  }
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/**
 * Builds an INSERT query from a plain object.
 *
 * - Converts camelCase keys to snake_case column names
 * - Skips undefined values
 * - Converts Date objects to ISO strings
 * - JSON.stringify for objects / arrays
 * - Returns the inserted row (RETURNING *)
 */
export function buildInsert(
  table: string,
  data: Record<string, unknown>,
): SqlQuery {
  assertSafeIdentifier(table, "table name")

  // Auto-generate UUID id if not provided
  if (!data.id) {
    data = { id: randomUUID(), ...data }
  }

  const columns: string[] = []
  const placeholders: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue

    const col = camelToSnake(key)
    assertSafeIdentifier(col, "column name")
    columns.push(col)
    values.push(serializeValue(value))
    placeholders.push(`$${values.length}`)
  }

  const text = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`
  return { text, values }
}

/**
 * Builds an UPDATE SET query from a plain object.
 *
 * - Converts camelCase keys to snake_case column names
 * - Skips undefined values
 * - Converts Date objects to ISO strings
 * - JSON.stringify for objects / arrays
 * - `where` should be a SQL fragment like `"id = $N"` using parameter
 *   numbers that start AFTER the SET values (use whereValues for binding)
 *
 * @example
 * const q = buildUpdate("users", { name: "Alice" }, "id", ["abc-123"])
 * // text: "UPDATE users SET name = $1 WHERE id = $2"
 * // values: ["Alice", "abc-123"]
 */
export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  where: string,
  whereValues: unknown[],
): SqlQuery {
  assertSafeIdentifier(table, "table name")

  const setClauses: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue

    const col = camelToSnake(key)
    assertSafeIdentifier(col, "column name")
    values.push(serializeValue(value))
    setClauses.push(`${col} = $${values.length}`)
  }

  // Append where values after set values and build the WHERE clause
  // by replacing column-name-style `where` with proper parameterisation.
  const whereParamStart = values.length
  const whereClauseParams = whereValues.map((v, i) => {
    values.push(v)
    return `$${whereParamStart + i + 1}`
  })

  // If `where` contains no "$" placeholders, treat it as a single column name
  // and auto-generate "column = $N".
  let whereClause: string
  if (!where.includes("$")) {
    whereClause = `${camelToSnake(where)} = ${whereClauseParams[0]}`
  } else {
    // Re-number existing $N placeholders in the where string
    let idx = 0
    whereClause = where.replace(/\$\d+/g, () => whereClauseParams[idx++])
  }

  const text = `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`
  return { text, values }
}

// ---------------------------------------------------------------------------
// Prefixed row mappers for JOINed queries
// ---------------------------------------------------------------------------

import type { Category, Client, Product, Project } from "@/lib/db-types"

/** Maps prefixed columns (e.g. cat_id, cat_name) to a Category, or null. */
export function mapCategoryFromRow(row: Record<string, unknown>, prefix = "cat_"): Category | null {
  if (!row[`${prefix}id`]) return null
  return {
    id: row[`${prefix}id`] as string,
    userId: row[`${prefix}user_id`] as string,
    code: row[`${prefix}code`] as string,
    name: row[`${prefix}name`] as string,
    color: row[`${prefix}color`] as string,
    llmPrompt: (row[`${prefix}llm_prompt`] as string) ?? null,
    createdAt: row[`${prefix}created_at`] ? new Date(row[`${prefix}created_at`] as string) : new Date(),
  }
}

/** Maps prefixed columns (e.g. proj_id, proj_name) to a Project, or null. */
export function mapProjectFromRow(row: Record<string, unknown>, prefix = "proj_"): Project | null {
  if (!row[`${prefix}id`]) return null
  return {
    id: row[`${prefix}id`] as string,
    userId: row[`${prefix}user_id`] as string,
    code: row[`${prefix}code`] as string,
    name: row[`${prefix}name`] as string,
    color: row[`${prefix}color`] as string,
    llmPrompt: (row[`${prefix}llm_prompt`] as string) ?? null,
    createdAt: row[`${prefix}created_at`] ? new Date(row[`${prefix}created_at`] as string) : new Date(),
  }
}

/** Maps prefixed columns (e.g. cl_id, cl_name) to a Client, or null. */
export function mapClientFromRow(row: Record<string, unknown>, prefix = "cl_"): Client | null {
  if (!row[`${prefix}id`]) return null
  return {
    id: row[`${prefix}id`] as string,
    userId: row[`${prefix}user_id`] as string,
    name: row[`${prefix}name`] as string,
    email: (row[`${prefix}email`] as string) ?? null,
    phone: (row[`${prefix}phone`] as string) ?? null,
    address: (row[`${prefix}address`] as string) ?? null,
    taxId: (row[`${prefix}tax_id`] as string) ?? null,
    notes: (row[`${prefix}notes`] as string) ?? null,
    createdAt: row[`${prefix}created_at`] ? new Date(row[`${prefix}created_at`] as string) : new Date(),
    updatedAt: row[`${prefix}updated_at`] ? new Date(row[`${prefix}updated_at`] as string) : new Date(),
  }
}

/** Maps prefixed columns (e.g. prod_id, prod_name) to a Product, or null. */
export function mapProductFromRow(row: Record<string, unknown>, prefix = "prod_"): Product | null {
  if (!row[`${prefix}id`]) return null
  return {
    id: row[`${prefix}id`] as string,
    userId: row[`${prefix}user_id`] as string,
    name: row[`${prefix}name`] as string,
    description: (row[`${prefix}description`] as string) ?? null,
    price: typeof row[`${prefix}price`] === "string" ? Number(row[`${prefix}price`]) : (row[`${prefix}price`] as number),
    currencyCode: row[`${prefix}currency_code`] as string,
    vatRate: typeof row[`${prefix}vat_rate`] === "string" ? Number(row[`${prefix}vat_rate`]) : (row[`${prefix}vat_rate`] as number),
    unit: (row[`${prefix}unit`] as string) ?? null,
    createdAt: row[`${prefix}created_at`] ? new Date(row[`${prefix}created_at`] as string) : new Date(),
    updatedAt: row[`${prefix}updated_at`] ? new Date(row[`${prefix}updated_at`] as string) : new Date(),
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value)
  }
  return value
}
