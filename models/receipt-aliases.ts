"use server"

import { sql, queryMany } from "@/lib/sql"
import { getPool } from "@/lib/pg"

export type ReceiptVendorAlias = {
  id: string
  userId: string
  vendorPattern: string
  merchantPattern: string
  usageCount: number
  source: string
  createdAt: Date
  updatedAt: Date
}

type AliasRow = {
  id: string
  user_id: string
  vendor_pattern: string
  merchant_pattern: string
  usage_count: number
  source: string
  created_at: Date
  updated_at: Date
}

function mapAliasRow(row: AliasRow): ReceiptVendorAlias {
  return {
    id: row.id,
    userId: row.user_id,
    vendorPattern: row.vendor_pattern,
    merchantPattern: row.merchant_pattern,
    usageCount: row.usage_count,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Normalize a vendor or merchant label to a stable pattern. Lowercase, trim,
 * collapse whitespace — keeps matching forgiving without going so far as to
 * lose information ("Leroy Merlin SL" and "leroy merlin s.l." both end up as
 * "leroy merlin s.l." which is close enough for substring matching).
 */
export function normalizeVendorPattern(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ")
}

export async function listAliases(
  userId: string,
  limit = 50,
): Promise<ReceiptVendorAlias[]> {
  const rows = await queryMany<AliasRow>(
    sql`SELECT * FROM receipt_vendor_aliases
         WHERE user_id = ${userId}
         ORDER BY usage_count DESC, updated_at DESC
         LIMIT ${limit}`,
  )
  return rows.map(mapAliasRow)
}

/**
 * Upsert a (vendor → merchant) mapping. On conflict increments `usage_count`
 * and refreshes `updated_at` so more-used aliases bubble to the top of
 * `listAliases`.
 */
export async function upsertAlias(
  userId: string,
  rawVendor: string,
  rawMerchant: string,
  source: "accept" | "manual" = "accept",
): Promise<void> {
  const vendor = normalizeVendorPattern(rawVendor)
  const merchant = normalizeVendorPattern(rawMerchant)
  if (!vendor || !merchant) return

  const pool = await getPool()
  await pool.query(
    `INSERT INTO receipt_vendor_aliases
       (user_id, vendor_pattern, merchant_pattern, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, vendor_pattern, merchant_pattern)
     DO UPDATE SET
       usage_count = receipt_vendor_aliases.usage_count + 1,
       updated_at = now()`,
    [userId, vendor, merchant, source],
  )
}
