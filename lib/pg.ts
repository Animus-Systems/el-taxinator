import { getPool as getEntityPool } from "@/lib/entities"
import type { Pool } from "pg"
import pgTypes from "pg-types"
import { ensureSchema } from "@/lib/schema"

/**
 * By default, node-pg returns `bigint` (OID 20) as a string to preserve
 * precision outside Number.MAX_SAFE_INTEGER. Our bigint columns are all
 * money-in-minor-units (amount_cents): 2^53 - 1 cents = 90 trillion euros,
 * well past any plausible business transaction. Parsing as Number keeps
 * downstream Zod output schemas (`z.number()`) happy without per-table
 * coercion.
 *
 * NUMERIC is intentionally left as string — crypto_lots.quantity_* columns
 * use numeric(28,12) precisely because a BTC quantity like 0.00000001
 * loses precision through a JS float.
 */
const INT8_OID = 20
pgTypes.setTypeParser(INT8_OID, (v: string) => Number.parseInt(v, 10))

/**
 * Returns the connection pool for the currently active entity.
 * The active entity is determined by the TAXINATOR_ENTITY cookie.
 */
export async function getPool(): Promise<Pool> {
  const pool = await getEntityPool()
  await ensureSchema(pool)
  return pool
}

// Re-export for backward compatibility
export { getPool as pool }
