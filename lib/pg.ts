import { getPool as getEntityPool } from "@/lib/entities"
import type pg from "pg"

/**
 * Returns the connection pool for the currently active entity.
 * The active entity is determined by the TAXINATOR_ENTITY cookie.
 */
export async function getPool(): Promise<pg.Pool> {
  return getEntityPool()
}

// Re-export for backward compatibility
export { getPool as pool }
