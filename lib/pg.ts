import { getPool as getEntityPool } from "@/lib/entities"
import type { Pool } from "pg"
import { ensureSchema } from "@/lib/schema"

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
