import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import { getPool } from "@/lib/pg"

export type IncomeSourceKind = "salary" | "rental" | "dividend" | "interest" | "other"

export type IncomeSource = {
  id: string
  userId: string
  kind: IncomeSourceKind
  name: string
  taxId: string | null
  metadata: Record<string, unknown>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export async function listIncomeSources(
  userId: string,
  kind?: IncomeSourceKind,
): Promise<IncomeSource[]> {
  if (kind) {
    return queryMany<IncomeSource>(
      sql`SELECT * FROM income_sources
           WHERE user_id = ${userId} AND kind = ${kind}
           ORDER BY is_active DESC, name ASC`,
    )
  }
  return queryMany<IncomeSource>(
    sql`SELECT * FROM income_sources
         WHERE user_id = ${userId}
         ORDER BY is_active DESC, kind ASC, name ASC`,
  )
}

export async function getIncomeSourceById(
  id: string,
  userId: string,
): Promise<IncomeSource | null> {
  return queryOne<IncomeSource>(
    sql`SELECT * FROM income_sources
         WHERE id = ${id} AND user_id = ${userId}`,
  )
}

export type IncomeSourceInput = {
  kind: IncomeSourceKind
  name: string
  taxId?: string | null
  metadata?: Record<string, unknown>
  isActive?: boolean
}

export async function createIncomeSource(
  userId: string,
  data: IncomeSourceInput,
): Promise<IncomeSource> {
  const row = await queryOne<IncomeSource>(
    buildInsert("income_sources", {
      userId,
      kind: data.kind,
      name: data.name,
      taxId: data.taxId ?? null,
      metadata: data.metadata ?? {},
      isActive: data.isActive ?? true,
    }),
  )
  if (!row) throw new Error("Failed to create income source")
  return row
}

/**
 * Find an existing row matching (kind, normalized name) or insert a new one.
 * Used by AI extractors so repeated uploads don't produce duplicate employers.
 */
export async function upsertIncomeSource(
  userId: string,
  data: IncomeSourceInput,
): Promise<IncomeSource> {
  const normalized = data.name.trim().toLowerCase()
  const existing = await queryOne<IncomeSource>(
    sql`SELECT * FROM income_sources
         WHERE user_id = ${userId}
           AND kind = ${data.kind}
           AND LOWER(TRIM(name)) = ${normalized}
         LIMIT 1`,
  )
  if (existing) {
    const patch: Record<string, unknown> = {}
    if (data.taxId && !existing.taxId) patch["taxId"] = data.taxId
    if (data.metadata) {
      patch["metadata"] = { ...existing.metadata, ...data.metadata }
    }
    if (Object.keys(patch).length === 0) return existing
    const updated = await queryOne<IncomeSource>(
      buildUpdate("income_sources", patch, "id = $1 AND user_id = $2", [existing.id, userId]),
    )
    return updated ?? existing
  }
  return createIncomeSource(userId, data)
}

export type IncomeSourceUpdate = {
  [K in keyof IncomeSourceInput]?: IncomeSourceInput[K] | undefined
}

export async function updateIncomeSource(
  id: string,
  userId: string,
  data: IncomeSourceUpdate,
): Promise<IncomeSource | null> {
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch["name"] = data.name
  if (data.taxId !== undefined) patch["taxId"] = data.taxId
  if (data.metadata !== undefined) patch["metadata"] = data.metadata
  if (data.isActive !== undefined) patch["isActive"] = data.isActive
  if (Object.keys(patch).length === 0) return getIncomeSourceById(id, userId)
  return queryOne<IncomeSource>(
    buildUpdate("income_sources", patch, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function deleteIncomeSource(id: string, userId: string): Promise<boolean> {
  const pool = await getPool()
  const res = await pool.query(
    `DELETE FROM income_sources WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return (res.rowCount ?? 0) > 0
}

export type IncomeSourceTotals = {
  sourceId: string
  grossCents: number
  netCents: number
  withheldCents: number
}

/**
 * YTD totals per income source from linked transactions.
 * `gross` reads from transactions.extra.payslip.grossCents when present,
 * otherwise falls back to transactions.total.
 */
export async function getIncomeSourceTotals(
  userId: string,
  year: number,
): Promise<IncomeSourceTotals[]> {
  const pool = await getPool()
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const result = await pool.query(
    `SELECT
       t.income_source_id AS source_id,
       COALESCE(SUM(COALESCE((t.extra->'payslip'->>'grossCents')::bigint, t.total)), 0) AS gross_cents,
       COALESCE(SUM(t.total), 0) AS net_cents,
       COALESCE(SUM(COALESCE((t.extra->'payslip'->>'irpfWithheldCents')::bigint, 0)), 0) AS withheld_cents
     FROM transactions t
     WHERE t.user_id = $1
       AND t.income_source_id IS NOT NULL
       AND t.issued_at >= $2 AND t.issued_at < $3
     GROUP BY t.income_source_id`,
    [userId, start, end],
  )
  return result.rows.map((row) => ({
    sourceId: String(row["source_id"]),
    grossCents: Number(row["gross_cents"] ?? 0),
    netCents: Number(row["net_cents"] ?? 0),
    withheldCents: Number(row["withheld_cents"] ?? 0),
  }))
}

export async function sumPersonalIncome(
  userId: string,
  year: number,
  kind: IncomeSourceKind,
): Promise<{ grossCents: number; withheldCents: number }> {
  const pool = await getPool()
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE((t.extra->'payslip'->>'grossCents')::bigint, t.total)), 0) AS gross_cents,
       COALESCE(SUM(COALESCE((t.extra->'payslip'->>'irpfWithheldCents')::bigint, 0)), 0) AS withheld_cents
     FROM transactions t
     JOIN income_sources s ON s.id = t.income_source_id AND s.user_id = t.user_id
     WHERE t.user_id = $1
       AND s.kind = $2
       AND t.issued_at >= $3 AND t.issued_at < $4`,
    [userId, kind, start, end],
  )
  const row = result.rows[0] ?? {}
  return {
    grossCents: Number(row["gross_cents"] ?? 0),
    withheldCents: Number(row["withheld_cents"] ?? 0),
  }
}
