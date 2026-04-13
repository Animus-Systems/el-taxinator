/**
 * Compatibility shim for @/lib/pg.
 *
 * Database access is server-only. This stub prevents import crashes.
 */

export function getPool(): never {
  throw new Error("getPool() is server-only. Use tRPC queries instead.")
}

export function getPoolForEntity(): never {
  throw new Error("getPoolForEntity() is server-only. Use tRPC queries instead.")
}
