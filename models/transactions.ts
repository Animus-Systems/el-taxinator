import {
  sql,
  queryMany,
  queryOne,
  buildInsert,
  buildUpdate,
  execute,
  mapRow,
  camelToSnake,
  mapCategoryFromRow,
  mapProjectFromRow,
} from "@/lib/sql"
import { getPool } from "@/lib/pg"
import { splitTransactionDataByFieldDefinitions } from "@/lib/transaction-data"
import type { Transaction, Category, Project, BulkUpdateFilter, BulkUpdatePatch } from "@/lib/db-types"
import { cache } from "react"
import { getFields } from "./fields"
import { deleteFile } from "./files"
import { maybePairNewTransaction, unlinkTransfer } from "@/models/transfers"

export type TransactionData = {
  name?: string | null
  description?: string | null
  merchant?: string | null
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  type?: string | null
  items?: TransactionData[] | undefined
  note?: string | null
  files?: string[] | undefined
  extra?: Record<string, unknown>
  categoryCode?: string | null
  accountId?: string | null
  projectCode?: string | null
  issuedAt?: Date | string | null
  text?: string | null
  status?: string | null
  incomeSourceId?: string | null
  appliedRuleId?: string | null
  transferId?: string | null
  transferDirection?: "outgoing" | "incoming" | null
  counterAccountId?: string | null
  [key: string]: unknown
}

export type TransactionFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  ordering?: string
  categoryCode?: string
  accountId?: string
  projectCode?: string
  type?: string
  hasReceipts?: "missing" | "attached" | ""
  page?: number
}

export type TransactionPagination = {
  limit: number
  offset: number
}

// Internal type for rows that come back from JOINed queries
type TransactionRow = Transaction & {
  category?: Category | null
  project?: Project | null
}

/**
 * Builds a WHERE clause and parameter list from the given filters.
 *
 * @param alias - table alias prefix for columns (e.g. "t" → "t.user_id"). Pass "" for no prefix.
 * @param paramOffset - the starting $N index (1-based).
 * @param extraConditions - additional raw conditions appended to the WHERE clause.
 */
export function buildTransactionWhere(
  userId: string,
  filters?: TransactionFilters,
  { alias = "t", paramOffset = 1, extraConditions }: {
    alias?: string
    paramOffset?: number
    extraConditions?: string[]
  } = {},
): { clause: string; values: unknown[]; nextIdx: number } {
  const col = (name: string) => alias ? `${alias}.${name}` : name
  const conditions: string[] = []
  const values: unknown[] = []
  let idx = paramOffset

  conditions.push(`${col("user_id")} = $${idx}`)
  values.push(userId)
  idx++

  if (filters) {
    if (filters.search) {
      const like = `%${filters.search}%`
      conditions.push(
        `(${col("name")} ILIKE $${idx} OR ${col("merchant")} ILIKE $${idx} OR ${col("description")} ILIKE $${idx} OR ${col("note")} ILIKE $${idx} OR ${col("text")} ILIKE $${idx})`,
      )
      values.push(like)
      idx++
    }

    if (filters.dateFrom) {
      conditions.push(`${col("issued_at")} >= $${idx}`)
      values.push(new Date(filters.dateFrom))
      idx++
    }

    if (filters.dateTo) {
      conditions.push(`${col("issued_at")} <= $${idx}`)
      values.push(new Date(filters.dateTo))
      idx++
    }

    if (filters.categoryCode) {
      conditions.push(`${col("category_code")} = $${idx}`)
      values.push(filters.categoryCode)
      idx++
    }

    if (filters.projectCode) {
      conditions.push(`${col("project_code")} = $${idx}`)
      values.push(filters.projectCode)
      idx++
    }

    if (filters.type) {
      conditions.push(`${col("type")} = $${idx}`)
      values.push(filters.type)
      idx++
    }

    if (filters.accountId) {
      conditions.push(`${col("account_id")} = $${idx}`)
      values.push(filters.accountId)
      idx++
    }

    if (filters.hasReceipts === "missing") {
      conditions.push(
        `${col("type")} = 'expense' AND ${col("status")} = 'business' AND jsonb_array_length(COALESCE(${col("files")}, '[]'::jsonb)) = 0`,
      )
    } else if (filters.hasReceipts === "attached") {
      conditions.push(
        `jsonb_array_length(COALESCE(${col("files")}, '[]'::jsonb)) > 0`,
      )
    }
  }

  if (extraConditions) {
    conditions.push(...extraConditions)
  }

  return {
    clause: conditions.length ? "WHERE " + conditions.join(" AND ") : "",
    values,
    nextIdx: idx,
  }
}

const SORTABLE_COLUMNS = new Set([
  "name", "merchant", "total", "converted_total", "issued_at", "created_at",
  "updated_at", "currency_code", "type", "category_code", "project_code", "account_id",
])

function buildOrderBy(filters?: TransactionFilters): string {
  if (filters?.ordering) {
    const isDesc = filters.ordering.startsWith("-")
    const field = isDesc ? filters.ordering.slice(1) : filters.ordering
    const col = camelToSnake(field)
    if (!SORTABLE_COLUMNS.has(col)) {
      return "ORDER BY t.created_at DESC"
    }
    return `ORDER BY t.${col} ${isDesc ? "DESC" : "ASC"}`
  }
  return "ORDER BY t.issued_at DESC"
}

/**
 * Maps a flat JOINed row into a Transaction with nested category/project/account.
 */
function mapTransactionRow(row: Record<string, unknown>): TransactionRow {
  const tx = mapRow<TransactionRow>(row)
  tx.category = mapCategoryFromRow(row)
  tx.project = mapProjectFromRow(row)
  // Map account fields from aliased columns
  const txAsRecord = tx as Record<string, unknown>
  if (row["account_name"] !== null && row["account_name"] !== undefined) {
    txAsRecord["accountName"] = row["account_name"]
    txAsRecord["accountBankName"] = row["account_bank_name"] ?? null
  } else {
    txAsRecord["accountName"] = null
    txAsRecord["accountBankName"] = null
  }
  return tx
}

const SELECT_WITH_JOINS = `
  SELECT t.*,
    c.id        AS cat_id,
    c.user_id   AS cat_user_id,
    c.code      AS cat_code,
    c.name      AS cat_name,
    c.color     AS cat_color,
    c.llm_prompt AS cat_llm_prompt,
    c.created_at AS cat_created_at,
    p.id        AS proj_id,
    p.user_id   AS proj_user_id,
    p.code      AS proj_code,
    p.name      AS proj_name,
    p.color     AS proj_color,
    p.llm_prompt AS proj_llm_prompt,
    p.created_at AS proj_created_at,
    a.name AS account_name, a.bank_name AS account_bank_name
  FROM transactions t
  LEFT JOIN categories c ON c.code = t.category_code AND c.user_id = t.user_id
  LEFT JOIN projects   p ON p.code = t.project_code  AND p.user_id = t.user_id
  LEFT JOIN accounts   a ON a.id = t.account_id AND a.user_id = t.user_id
`

export async function getTransactionDateRange(
  userId: string,
  filters?: TransactionFilters,
): Promise<{ earliest: string | null; latest: string | null }> {
  const pool = await getPool()
  const { clause, values } = buildTransactionWhere(userId, filters)
  const result = await pool.query(
    `SELECT MIN(t.issued_at) AS earliest, MAX(t.issued_at) AS latest FROM transactions t ${clause}`,
    values,
  )
  const row = result.rows[0] as { earliest?: Date | string | null; latest?: Date | string | null } | undefined
  return {
    earliest: row?.earliest ? new Date(row.earliest).toISOString().slice(0, 10) : null,
    latest: row?.latest ? new Date(row.latest).toISOString().slice(0, 10) : null,
  }
}

export const getTransactions = cache(
  async (
    userId: string,
    filters?: TransactionFilters,
    pagination?: TransactionPagination,
  ): Promise<{
    transactions: TransactionRow[]
    total: number
  }> => {
    const pool = await getPool()
    const { clause, values } = buildTransactionWhere(userId, filters)
    const orderBy = buildOrderBy(filters)

    if (pagination) {
      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM transactions t ${clause}`,
        values,
      )
      const total: number = (countResult.rows[0]?.["count"] as number | undefined) ?? 0

      // Get page of results with JOINs
      const limitIdx = values.length + 1
      const offsetIdx = values.length + 2
      const queryText = `${SELECT_WITH_JOINS} ${clause} ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`
      const result = await pool.query(queryText, [
        ...values,
        pagination.limit,
        pagination.offset,
      ])
      const transactions = result.rows.map(mapTransactionRow)
      return { transactions, total }
    } else {
      const queryText = `${SELECT_WITH_JOINS} ${clause} ${orderBy}`
      const result = await pool.query(queryText, values)
      const transactions = result.rows.map(mapTransactionRow)
      return { transactions, total: transactions.length }
    }
  },
)

export const getTransactionById = cache(
  async (id: string, userId: string): Promise<TransactionRow | null> => {
    const pool = await getPool()
    const result = await pool.query(
      `${SELECT_WITH_JOINS} WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId],
    )
    const row = result.rows[0]
    if (!row) return null
    return mapTransactionRow(row)
  },
)

export const getTransactionsByFileId = cache(
  async (fileId: string, userId: string): Promise<Transaction[]> => {
    // files column is a JSON array of file IDs — use @> containment operator
    return queryMany<Transaction>(
      sql`SELECT * FROM transactions WHERE files::jsonb @> ${JSON.stringify([fileId])}::jsonb AND user_id = ${userId}`,
    )
  },
)

export async function findSimilarByMerchant(
  userId: string,
  merchant: string,
  limit: number,
  excludeId: string,
): Promise<Transaction[]> {
  return queryMany<Transaction>(
    sql`SELECT * FROM transactions
        WHERE user_id = ${userId} AND id <> ${excludeId}
          AND merchant ILIKE ${"%" + merchant + "%"}
        ORDER BY issued_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit}`,
  )
}

export const createTransaction = async (
  userId: string,
  data: TransactionData,
): Promise<Transaction> => {
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)

  const insertData: Record<string, unknown> = {
    ...standard,
    extra,
    items: data.items ?? [],
    userId,
  }

  const result = await queryOne<Transaction>(buildInsert("transactions", insertData))
  if (result) {
    // Fire-and-forget pairing: a transfer match is never required for the
    // row to be created, so failures here must not break the insert.
    try {
      await maybePairNewTransaction(result)
    } catch (err) {
      console.warn("[transactions] maybePairNewTransaction failed:", err)
    }
  }
  return result!
}

export const updateTransaction = async (
  id: string,
  userId: string,
  data: TransactionData,
): Promise<Transaction> => {
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)

  const updateData: Record<string, unknown> = {
    ...standard,
    extra,
    items: data.items ? data.items : [],
  }

  const result = await queryOne<Transaction>(
    buildUpdate("transactions", updateData, "id = $1 AND user_id = $2", [id, userId]),
  )
  return result!
}

export const updateTransactionFiles = async (
  id: string,
  userId: string,
  files: string[],
): Promise<Transaction> => {
  const result = await queryOne<Transaction>(
    buildUpdate("transactions", { files }, "id = $1 AND user_id = $2", [id, userId]),
  )
  return result!
}

export const deleteTransaction = async (
  id: string,
  userId: string,
  entityId: string,
): Promise<Transaction | undefined> => {
  const transaction = await getTransactionById(id, userId)

  if (transaction) {
    const files = Array.isArray(transaction.files) ? transaction.files : []

    for (const fileId of files as string[]) {
      if ((await getTransactionsByFileId(fileId, userId)).length <= 1) {
        await deleteFile(fileId, userId, entityId)
      }
    }

    // If the row is one leg of a paired transfer, unlink first so the surviving
    // sibling doesn't end up with a dangling transfer_id / counter_account_id.
    // unlinkTransfer restores both legs' pre-transfer type from extra.preMigrationType.
    if (transaction.transferId) {
      try {
        await unlinkTransfer({ userId, transferId: transaction.transferId })
      } catch (err) {
        console.warn("[transactions] unlinkTransfer before delete failed:", err)
      }
    }

    await execute(
      sql`DELETE FROM transactions WHERE id = ${id} AND user_id = ${userId}`,
    )
    return transaction
  }
  return undefined
}

export const bulkDeleteTransactions = async (ids: string[], userId: string, entityId: string) => {
  const pool = await getPool()
  if (ids.length === 0) return { count: 0 }

  // Collect file IDs from transactions being deleted
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ")
  const txRows = await pool.query(
    `SELECT id, files FROM transactions WHERE id IN (${placeholders}) AND user_id = $1`,
    [userId, ...ids],
  )

  // Delete the transactions
  const result = await pool.query(
    `DELETE FROM transactions WHERE id IN (${placeholders}) AND user_id = $1`,
    [userId, ...ids],
  )

  // Clean up orphaned files
  const allFileIds = new Set<string>()
  for (const row of txRows.rows) {
    const files = row["files"]
    if (Array.isArray(files)) {
      for (const fid of files) allFileIds.add(fid as string)
    }
  }

  for (const fileId of allFileIds) {
    const refs = await getTransactionsByFileId(fileId, userId)
    if (refs.length === 0) {
      await deleteFile(fileId, userId, entityId)
    }
  }

  return { count: result.rowCount ?? 0 }
}

const splitTransactionDataExtraFields = async (
  data: TransactionData,
  userId: string,
): Promise<{ standard: TransactionData; extra: Record<string, unknown> }> => {
  const fields = await getFields(userId)
  return splitTransactionDataByFieldDefinitions(data, fields)
}

export type BulkUpdateResult = {
  matchCount: number
  sampleIds: string[]
  updated: number
}

const BULK_UPDATE_CAP = 1000

export async function bulkUpdateTransactions(
  userId: string,
  filter: BulkUpdateFilter,
  patch: BulkUpdatePatch,
  opts: { dryRun?: boolean } = {},
): Promise<BulkUpdateResult> {
  const whereParts: string[] = ["user_id = $1"]
  const values: unknown[] = [userId]

  if (filter.search) {
    values.push(`%${filter.search}%`)
    const p = `$${values.length}`
    whereParts.push(`(name ILIKE ${p} OR merchant ILIKE ${p} OR description ILIKE ${p} OR note ILIKE ${p})`)
  }
  if (filter.merchant) {
    values.push(`%${filter.merchant}%`)
    whereParts.push(`merchant ILIKE $${values.length}`)
  }
  if (filter.categoryCode) {
    values.push(filter.categoryCode)
    whereParts.push(`category_code = $${values.length}`)
  }
  if (filter.projectCode) {
    values.push(filter.projectCode)
    whereParts.push(`project_code = $${values.length}`)
  }
  if (filter.type) {
    values.push(filter.type)
    whereParts.push(`type = $${values.length}`)
  }
  if (filter.accountId) {
    values.push(filter.accountId)
    whereParts.push(`account_id = $${values.length}`)
  }
  if (filter.dateFrom) {
    values.push(filter.dateFrom)
    whereParts.push(`issued_at >= $${values.length}`)
  }
  if (filter.dateTo) {
    values.push(filter.dateTo)
    whereParts.push(`issued_at <= $${values.length}`)
  }

  const whereClause = whereParts.join(" AND ")

  const pool = await getPool()

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM transactions WHERE ${whereClause} LIMIT 5000`,
    values,
  )
  const matchCount = (countResult.rows[0]?.["count"] as number | undefined) ?? 0

  const sampleResult = await pool.query(
    `SELECT id FROM transactions WHERE ${whereClause} ORDER BY created_at DESC LIMIT 10`,
    values,
  )
  const sampleIds = sampleResult.rows.map((r) => r["id"] as string)

  if (opts.dryRun === true) {
    return { matchCount, sampleIds, updated: 0 }
  }

  if (matchCount > BULK_UPDATE_CAP) {
    throw new Error(`Too many matches (${matchCount}). Narrow the filter to under ${BULK_UPDATE_CAP}.`)
  }

  if (matchCount === 0) {
    return { matchCount, sampleIds, updated: 0 }
  }

  const setParts: string[] = []
  const patchValues: unknown[] = [...values]
  if (patch.categoryCode !== undefined) {
    patchValues.push(patch.categoryCode)
    setParts.push(`category_code = $${patchValues.length}`)
  }
  if (patch.projectCode !== undefined) {
    patchValues.push(patch.projectCode)
    setParts.push(`project_code = $${patchValues.length}`)
  }
  if (patch.type !== undefined) {
    patchValues.push(patch.type)
    setParts.push(`type = $${patchValues.length}`)
  }
  if (patch.note !== undefined) {
    patchValues.push(patch.note)
    setParts.push(`note = $${patchValues.length}`)
  }

  if (setParts.length === 0) return { matchCount, sampleIds, updated: 0 }

  const updateText = `UPDATE transactions SET ${setParts.join(", ")} WHERE ${whereClause}`
  const updateResult = await pool.query(updateText, patchValues)

  return { matchCount, sampleIds, updated: updateResult.rowCount ?? 0 }
}
