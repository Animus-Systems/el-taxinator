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
import type { Transaction, Category, Project, Field } from "@/lib/db-types"
import { cache } from "react"
import { getFields } from "./fields"
import { deleteFile } from "./files"

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
  projectCode?: string | null
  issuedAt?: Date | string | null
  text?: string | null
  [key: string]: unknown
}

export type TransactionFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  ordering?: string
  categoryCode?: string
  projectCode?: string
  type?: string
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
  "updated_at", "currency_code", "type", "category_code", "project_code",
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
 * Maps a flat JOINed row into a Transaction with nested category/project.
 */
function mapTransactionRow(row: Record<string, unknown>): TransactionRow {
  const tx = mapRow<TransactionRow>(row)
  tx.category = mapCategoryFromRow(row)
  tx.project = mapProjectFromRow(row)
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
    p.created_at AS proj_created_at
  FROM transactions t
  LEFT JOIN categories c ON c.code = t.category_code AND c.user_id = t.user_id
  LEFT JOIN projects   p ON p.code = t.project_code  AND p.user_id = t.user_id
`

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
      const total: number = countResult.rows[0]?.count ?? 0

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
    if (result.rows.length === 0) return null
    return mapTransactionRow(result.rows[0])
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
): Promise<Transaction | undefined> => {
  const transaction = await getTransactionById(id, userId)

  if (transaction) {
    const files = Array.isArray(transaction.files) ? transaction.files : []

    for (const fileId of files as string[]) {
      if ((await getTransactionsByFileId(fileId, userId)).length <= 1) {
        await deleteFile(fileId, userId)
      }
    }

    await execute(
      sql`DELETE FROM transactions WHERE id = ${id} AND user_id = ${userId}`,
    )
    return transaction
  }
}

export const bulkDeleteTransactions = async (ids: string[], userId: string) => {
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
    const files = row.files
    if (Array.isArray(files)) {
      for (const fid of files) allFileIds.add(fid as string)
    }
  }

  for (const fileId of allFileIds) {
    const refs = await getTransactionsByFileId(fileId, userId)
    if (refs.length === 0) {
      await deleteFile(fileId, userId)
    }
  }

  return { count: result.rowCount ?? 0 }
}

const splitTransactionDataExtraFields = async (
  data: TransactionData,
  userId: string,
): Promise<{ standard: TransactionData; extra: Record<string, unknown> }> => {
  const fields = await getFields(userId)
  const fieldMap = fields.reduce(
    (acc, field) => {
      acc[field.code] = field
      return acc
    },
    {} as Record<string, Field>,
  )

  const standard: TransactionData = {}
  const extra: Record<string, unknown> = {}

  Object.entries(data).forEach(([key, value]) => {
    const fieldDef = fieldMap[key]
    if (fieldDef) {
      if (fieldDef.isExtra) {
        extra[key] = value
      } else {
        standard[key] = value
      }
    }
  })

  return { standard, extra }
}
