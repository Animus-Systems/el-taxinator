import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import { getPool } from "@/lib/pg"

export type DeductionKind =
  | "pension"
  | "mortgage"
  | "donation"
  | "family"
  | "regional"
  | "other"

export type PersonalDeduction = {
  id: string
  userId: string
  kind: DeductionKind
  taxYear: number
  amountCents: number
  description: string | null
  fileId: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export async function listDeductions(
  userId: string,
  taxYear: number,
): Promise<PersonalDeduction[]> {
  return queryMany<PersonalDeduction>(
    sql`SELECT * FROM personal_deductions
         WHERE user_id = ${userId} AND tax_year = ${taxYear}
         ORDER BY kind ASC, created_at DESC`,
  )
}

export async function getDeductionById(
  id: string,
  userId: string,
): Promise<PersonalDeduction | null> {
  return queryOne<PersonalDeduction>(
    sql`SELECT * FROM personal_deductions
         WHERE id = ${id} AND user_id = ${userId}`,
  )
}

export type DeductionInput = {
  kind: DeductionKind
  taxYear: number
  amountCents: number
  description?: string | null
  fileId?: string | null
  metadata?: Record<string, unknown>
}

export async function createDeduction(
  userId: string,
  data: DeductionInput,
): Promise<PersonalDeduction> {
  const row = await queryOne<PersonalDeduction>(
    buildInsert("personal_deductions", {
      userId,
      kind: data.kind,
      taxYear: data.taxYear,
      amountCents: data.amountCents,
      description: data.description ?? null,
      fileId: data.fileId ?? null,
      metadata: data.metadata ?? {},
    }),
  )
  if (!row) throw new Error("Failed to create deduction")
  return row
}

export type DeductionUpdate = {
  [K in keyof DeductionInput]?: DeductionInput[K] | undefined
}

export async function updateDeduction(
  id: string,
  userId: string,
  data: DeductionUpdate,
): Promise<PersonalDeduction | null> {
  const patch: Record<string, unknown> = {}
  if (data.kind !== undefined) patch["kind"] = data.kind
  if (data.taxYear !== undefined) patch["taxYear"] = data.taxYear
  if (data.amountCents !== undefined) patch["amountCents"] = data.amountCents
  if (data.description !== undefined) patch["description"] = data.description
  if (data.fileId !== undefined) patch["fileId"] = data.fileId
  if (data.metadata !== undefined) patch["metadata"] = data.metadata
  if (Object.keys(patch).length === 0) return getDeductionById(id, userId)
  return queryOne<PersonalDeduction>(
    buildUpdate("personal_deductions", patch, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function deleteDeduction(id: string, userId: string): Promise<boolean> {
  const pool = await getPool()
  const res = await pool.query(
    `DELETE FROM personal_deductions WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * Spanish IRPF applies different deductions differently:
 *  - `pension`: reduces base general (capped at €1,500 personal)
 *  - `donation`: 80% of first €250 + 40% above, credit against cuota
 *  - `mortgage` (pre-2013): 15% credit up to €9,040 base
 *  - `family`, `regional`, `other`: credits against cuota
 */
export async function sumDeductionsForYear(
  userId: string,
  taxYear: number,
): Promise<{ baseReductionCents: number; cuotaCreditCents: number }> {
  const rows = await listDeductions(userId, taxYear)

  let baseReductionCents = 0
  let cuotaCreditCents = 0

  for (const d of rows) {
    if (d.kind === "pension") {
      baseReductionCents += Math.min(d.amountCents, 150_000)
    } else if (d.kind === "donation") {
      const first = Math.min(d.amountCents, 25_000)
      const rest = Math.max(0, d.amountCents - 25_000)
      cuotaCreditCents += Math.round(first * 0.8 + rest * 0.4)
    } else if (d.kind === "mortgage") {
      cuotaCreditCents += Math.min(Math.round(d.amountCents * 0.15), 135_600)
    } else {
      cuotaCreditCents += d.amountCents
    }
  }

  return { baseReductionCents, cuotaCreditCents }
}
