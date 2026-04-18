import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { TaxFiling } from "@/lib/db-types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaxFilingPatch = {
  filedAt?: Date | null
  checklist?: Record<string, boolean>
  notes?: string | null
  filedAmountCents?: number | null
  confirmationNumber?: string | null
  filingSource?: "app" | "external" | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List all tax filings for a user within a given year. Returns both
 * quarterly (quarter 1-4) and annual (quarter NULL) filings. Sorted by
 * quarter ascending (NULLS LAST) and then modelo code.
 */
export async function listFilings(userId: string, year: number): Promise<TaxFiling[]> {
  return queryMany<TaxFiling>(
    sql`SELECT * FROM tax_filings
        WHERE user_id = ${userId} AND year = ${year}
        ORDER BY quarter ASC NULLS LAST, modelo_code ASC
        LIMIT 1000`,
  )
}

/**
 * Look up a single filing by its natural key (user + year + quarter + modelo).
 * `quarter` is `null` for annual filings (modelo 100, 720, etc.).
 */
export async function getFiling(
  userId: string,
  year: number,
  quarter: number | null,
  modeloCode: string,
): Promise<TaxFiling | null> {
  if (quarter === null) {
    return queryOne<TaxFiling>(
      sql`SELECT * FROM tax_filings
          WHERE user_id = ${userId}
            AND year = ${year}
            AND quarter IS NULL
            AND modelo_code = ${modeloCode}`,
    )
  }
  return queryOne<TaxFiling>(
    sql`SELECT * FROM tax_filings
        WHERE user_id = ${userId}
          AND year = ${year}
          AND quarter = ${quarter}
          AND modelo_code = ${modeloCode}`,
  )
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Insert or update a filing. Matches on (user_id, year, COALESCE(quarter, -1),
 * modelo_code) — the same expression used by `tax_filings_unique_idx`. Only
 * fields provided in `patch` are updated on conflict; unspecified fields keep
 * their existing values.
 */
export async function upsertFiling(
  userId: string,
  year: number,
  quarter: number | null,
  modeloCode: string,
  patch: TaxFilingPatch,
): Promise<TaxFiling> {
  // Build the DO UPDATE SET clause only for fields explicitly provided in
  // `patch` — this preserves pre-existing values for fields the caller did
  // not mention. `updated_at` is always bumped on conflict.
  const setClauses: string[] = []
  if (patch.filedAt !== undefined) setClauses.push("filed_at = EXCLUDED.filed_at")
  if (patch.checklist !== undefined) setClauses.push("checklist = EXCLUDED.checklist")
  if (patch.notes !== undefined) setClauses.push("notes = EXCLUDED.notes")
  if (patch.filedAmountCents !== undefined) setClauses.push("filed_amount_cents = EXCLUDED.filed_amount_cents")
  if (patch.confirmationNumber !== undefined) setClauses.push("confirmation_number = EXCLUDED.confirmation_number")
  if (patch.filingSource !== undefined) setClauses.push("filing_source = EXCLUDED.filing_source")
  setClauses.push("updated_at = CURRENT_TIMESTAMP")

  // Values in the INSERT VALUES list. For fields not in `patch`, fall back to
  // sensible defaults that match the schema's defaults (empty checklist, null
  // filedAt/notes). The ON CONFLICT branch only overwrites fields we chose to
  // include in setClauses, so these defaults only matter on the insert path.
  const filedAt = patch.filedAt ?? null
  const checklist = patch.checklist ?? {}
  const notes = patch.notes ?? null
  const filedAmountCents = patch.filedAmountCents ?? null
  const confirmationNumber = patch.confirmationNumber ?? null
  const filingSource = patch.filingSource ?? null

  const text = `INSERT INTO tax_filings
      (user_id, year, quarter, modelo_code, filed_at, checklist, notes,
       filed_amount_cents, confirmation_number, filing_source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (user_id, year, COALESCE(quarter, -1), modelo_code)
    DO UPDATE SET ${setClauses.join(", ")}
    RETURNING *`
  const values: unknown[] = [
    userId,
    year,
    quarter,
    modeloCode,
    filedAt,
    JSON.stringify(checklist),
    notes,
    filedAmountCents,
    confirmationNumber,
    filingSource,
  ]
  const row = await queryOne<TaxFiling>({ text, values })
  if (!row) throw new Error("upsertFiling: no row returned")
  return row
}

/** Delete a single filing by its natural key. No-op if no row matches. */
export async function clearFiling(
  userId: string,
  year: number,
  quarter: number | null,
  modeloCode: string,
): Promise<void> {
  if (quarter === null) {
    await execute(
      sql`DELETE FROM tax_filings
          WHERE user_id = ${userId}
            AND year = ${year}
            AND quarter IS NULL
            AND modelo_code = ${modeloCode}`,
    )
    return
  }
  await execute(
    sql`DELETE FROM tax_filings
        WHERE user_id = ${userId}
          AND year = ${year}
          AND quarter = ${quarter}
          AND modelo_code = ${modeloCode}`,
  )
}
