"use server"

import { sql, queryMany, queryOne, buildInsert, buildUpdate, execute, mapRow } from "@/lib/sql"
import { getPool } from "@/lib/pg"
import type { File } from "@/lib/db-types"

type FileCreateData = {
  id?: string
  filename: string
  path: string
  mimetype: string
  isReviewed?: boolean
  isSplitted?: boolean
  metadata?: unknown
  cachedParseResult?: unknown
}

type FileUpdateData = Partial<Omit<FileCreateData, "id">>
import { fullPathForFile, getUserUploadsDirectory, unsortedFilePath } from "@/lib/files"
import { randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"
import { getTransactionById } from "./transactions"

export const getUnsortedFiles = cache(async (userId: string): Promise<File[]> => {
  return queryMany<File>(
    sql`SELECT * FROM files WHERE is_reviewed = false AND user_id = ${userId} ORDER BY created_at DESC LIMIT 500`
  )
})

export type FileStatusFilter = "all" | "unreviewed" | "linked" | "orphan"

export type FilesListOptions = {
  status: FileStatusFilter
  search: string
  page: number
  pageSize: number
}

export type FileImportSessionRole = "source" | "context"

export type FileWithLink = File & {
  linkedTransactionId: string | null
  linkedTransactionName: string | null
  linkedInvoiceId: string | null
  linkedInvoiceNumber: string | null
  linkedImportSessionId: string | null
  linkedImportSessionTitle: string | null
  linkedImportSessionRole: FileImportSessionRole | null
  linkedDeductionId: string | null
  linkedDeductionKind: string | null
  linkedDeductionTaxYear: number | null
}

export type FilesListResult = {
  files: FileWithLink[]
  total: number
}

/**
 * Paginated list of every file this user owns, plus pointers to whatever
 * domain record references it, and filtering by status.
 *
 * A file is considered "linked" if ANY of these hold:
 *   - its id appears in any transaction's `files` jsonb array
 *   - it is referenced by an invoice's `pdf_file_id`
 *   - it is the source file of an import_sessions row (`file_id`)
 *   - it appears in an import_sessions row's `context_file_ids` array
 *   - it is referenced by a personal_deductions row's `file_id`
 *
 * Rationale for the last three: CSV source files, wizard context attachments,
 * and deduction receipts all used to be reported as "orphan" because the
 * query only looked at transactions and invoices. That was misleading — those
 * files are linked, just not to a transaction.
 *
 * `orphan` = reviewed but not linked to any of the above.
 * `unreviewed` = `is_reviewed = false`.
 */
export const getFiles = async (userId: string, options: FilesListOptions): Promise<FilesListResult> => {
  const pool = await getPool()
  const { status, search, page, pageSize } = options
  const offset = Math.max(0, (page - 1)) * pageSize
  const trimmedSearch = search.trim()
  const searchPattern = trimmedSearch ? `%${trimmedSearch}%` : null

  // Build WHERE clauses + params. $1 is always userId.
  const conditions: string[] = ["f.user_id = $1"]
  const params: unknown[] = [userId]

  if (searchPattern !== null) {
    params.push(searchPattern)
    conditions.push(`f.filename ILIKE $${params.length}`)
  }

  const anyLinkSql =
    "(lt.id IS NOT NULL OR li.id IS NOT NULL OR lis_src.id IS NOT NULL OR lis_ctx.id IS NOT NULL OR lpd.id IS NOT NULL)"
  const noLinkSql =
    "(lt.id IS NULL AND li.id IS NULL AND lis_src.id IS NULL AND lis_ctx.id IS NULL AND lpd.id IS NULL)"

  if (status === "unreviewed") {
    conditions.push("f.is_reviewed = false")
  } else if (status === "linked") {
    conditions.push(anyLinkSql)
  } else if (status === "orphan") {
    conditions.push(`${noLinkSql} AND f.is_reviewed = true`)
  }

  const whereClause = conditions.join(" AND ")

  // Five LATERAL joins, one per linkage domain. LEFT JOIN + LIMIT 1 keeps the
  // outer row count stable when a file happens to be referenced by multiple
  // entities of the same kind (e.g. shared across two transactions).
  const fromClause = `
    FROM files f
    LEFT JOIN LATERAL (
      SELECT t.id, t.name
      FROM transactions t
      WHERE t.user_id = f.user_id AND t.files ? f.id::text
      LIMIT 1
    ) lt ON TRUE
    LEFT JOIN LATERAL (
      SELECT i.id, i.number
      FROM invoices i
      WHERE i.user_id = f.user_id AND i.pdf_file_id = f.id
      LIMIT 1
    ) li ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.id, s.title, s.file_name
      FROM import_sessions s
      WHERE s.user_id = f.user_id AND s.file_id = f.id
      LIMIT 1
    ) lis_src ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.id, s.title, s.file_name
      FROM import_sessions s
      WHERE s.user_id = f.user_id AND s.context_file_ids ? f.id::text
      LIMIT 1
    ) lis_ctx ON TRUE
    LEFT JOIN LATERAL (
      SELECT pd.id, pd.kind, pd.tax_year
      FROM personal_deductions pd
      WHERE pd.user_id = f.user_id AND pd.file_id = f.id
      LIMIT 1
    ) lpd ON TRUE
    WHERE ${whereClause}
  `

  params.push(pageSize)
  const limitPlaceholder = `$${params.length}`
  params.push(offset)
  const offsetPlaceholder = `$${params.length}`

  const rowsResult = await pool.query(
    `SELECT f.*,
            lt.id AS linked_transaction_id, lt.name AS linked_transaction_name,
            li.id AS linked_invoice_id, li.number AS linked_invoice_number,
            lis_src.id AS linked_source_session_id,
            lis_src.title AS linked_source_session_title,
            lis_src.file_name AS linked_source_session_file_name,
            lis_ctx.id AS linked_context_session_id,
            lis_ctx.title AS linked_context_session_title,
            lis_ctx.file_name AS linked_context_session_file_name,
            lpd.id AS linked_deduction_id,
            lpd.kind AS linked_deduction_kind,
            lpd.tax_year AS linked_deduction_tax_year
     ${fromClause}
     ORDER BY f.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params,
  )

  // Count excludes LIMIT/OFFSET params.
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count ${fromClause}`,
    params.slice(0, params.length - 2),
  )

  const files: FileWithLink[] = rowsResult.rows.map((row) => {
    const file = mapRow<File>(row)
    const linkedTxId = row["linked_transaction_id"]
    const linkedTxName = row["linked_transaction_name"]
    const linkedInvId = row["linked_invoice_id"]
    const linkedInvNumber = row["linked_invoice_number"]

    // Prefer "source" over "context" if both somehow match the same file —
    // being the session's source file is a stronger link than being attached
    // as context. In practice they're mutually exclusive.
    const srcId = row["linked_source_session_id"]
    const srcTitle = row["linked_source_session_title"]
    const srcFileName = row["linked_source_session_file_name"]
    const ctxId = row["linked_context_session_id"]
    const ctxTitle = row["linked_context_session_title"]
    const ctxFileName = row["linked_context_session_file_name"]
    let linkedImportSessionId: string | null = null
    let linkedImportSessionTitle: string | null = null
    let linkedImportSessionRole: FileImportSessionRole | null = null
    if (typeof srcId === "string") {
      linkedImportSessionId = srcId
      linkedImportSessionTitle =
        (typeof srcTitle === "string" && srcTitle) ||
        (typeof srcFileName === "string" && srcFileName) ||
        null
      linkedImportSessionRole = "source"
    } else if (typeof ctxId === "string") {
      linkedImportSessionId = ctxId
      linkedImportSessionTitle =
        (typeof ctxTitle === "string" && ctxTitle) ||
        (typeof ctxFileName === "string" && ctxFileName) ||
        null
      linkedImportSessionRole = "context"
    }

    const deductionId = row["linked_deduction_id"]
    const deductionKind = row["linked_deduction_kind"]
    const deductionTaxYear = row["linked_deduction_tax_year"]

    return {
      ...file,
      linkedTransactionId: typeof linkedTxId === "string" ? linkedTxId : null,
      linkedTransactionName: typeof linkedTxName === "string" ? linkedTxName : null,
      linkedInvoiceId: typeof linkedInvId === "string" ? linkedInvId : null,
      linkedInvoiceNumber: typeof linkedInvNumber === "string" ? linkedInvNumber : null,
      linkedImportSessionId,
      linkedImportSessionTitle,
      linkedImportSessionRole,
      linkedDeductionId: typeof deductionId === "string" ? deductionId : null,
      linkedDeductionKind: typeof deductionKind === "string" ? deductionKind : null,
      linkedDeductionTaxYear: typeof deductionTaxYear === "number" ? deductionTaxYear : null,
    }
  })

  const total = countResult.rows[0]?.["count"] ?? 0
  return { files, total: typeof total === "number" ? total : 0 }
}

export const getUnsortedFilesCount = cache(async (userId: string): Promise<number> => {
  const pool = await getPool()
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM files WHERE is_reviewed = false AND user_id = $1`,
    [userId]
  )
  return result.rows[0]?.["count"] ?? 0
})

export const getFileById = cache(async (id: string, userId: string): Promise<File | null> => {
  return queryOne<File>(
    sql`SELECT * FROM files WHERE id = ${id} AND user_id = ${userId}`
  )
})

export const getFilesByTransactionId = cache(async (id: string, userId: string): Promise<File[]> => {
  const pool = await getPool()
  const transaction = await getTransactionById(id, userId)
  if (transaction && transaction.files) {
    const fileIds = transaction.files as string[]
    if (fileIds.length === 0) return []
    // Build IN clause with parameterized values
    const placeholders = fileIds.map((_, i) => `$${i + 2}`).join(", ")
    const result = await pool.query(
      `SELECT * FROM files WHERE id IN (${placeholders}) AND user_id = $1 ORDER BY created_at ASC`,
      [userId, ...fileIds]
    )
    return result.rows.map((row) => mapRow<File>(row))
  }
  return []
})

/**
 * Bulk-load files by IDs. Avoids N+1 when loading attachments for many transactions.
 */
export async function getFilesByIds(fileIds: string[], userId: string): Promise<File[]> {
  if (fileIds.length === 0) return []
  const pool = await getPool()
  const placeholders = fileIds.map((_, i) => `$${i + 2}`).join(", ")
  const result = await pool.query(
    `SELECT * FROM files WHERE id IN (${placeholders}) AND user_id = $1`,
    [userId, ...fileIds],
  )
  return result.rows.map((row) => mapRow<File>(row))
}

export const createFile = async (userId: string, data: FileCreateData): Promise<File> => {
  const row = { ...data, userId }
  const result = await queryOne<File>(buildInsert("files", row))
  return result!
}

export type PersistUploadedFileInput = {
  fileName: string
  mimetype: string
  buffer: Buffer
  /** `false` leaves the file in the Inbox; `true` skips the Inbox queue. */
  isReviewed?: boolean
}

/**
 * Persist a just-uploaded file to disk under the entity's uploads folder
 * and record a row in the `files` table. Returns the created row.
 *
 * Use this whenever a buffer comes in over HTTP so the bytes don't vanish
 * after the request (wizard PDF/CSV extract, drop-zone uploads, etc.).
 */
export async function persistUploadedFile(
  userId: string,
  entityId: string,
  input: PersistUploadedFileInput,
): Promise<File> {
  const fileId = randomUUID()
  const relativePath = unsortedFilePath(fileId, input.fileName)
  const absolutePath = path.join(getUserUploadsDirectory(entityId), relativePath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, input.buffer)

  return createFile(userId, {
    id: fileId,
    filename: input.fileName,
    path: relativePath,
    mimetype: input.mimetype,
    isReviewed: input.isReviewed ?? false,
    metadata: { size: input.buffer.length },
  })
}

export const updateFile = async (id: string, userId: string, data: FileUpdateData): Promise<File> => {
  const result = await queryOne<File>(
    buildUpdate("files", data, "id = $1 AND user_id = $2", [id, userId])
  )
  return result!
}

/**
 * Append a file id to a transaction's `files` jsonb array (idempotent — a no-op
 * if the file is already referenced). Scoped by user_id so callers can't touch
 * other users' rows. Returns `true` if the row existed (even if no change).
 */
export async function attachFileToTransaction(
  userId: string,
  transactionId: string,
  fileId: string,
): Promise<boolean> {
  const pool = await getPool()
  const result = await pool.query(
    `UPDATE transactions
        SET files = CASE
          WHEN files ? $3 THEN files
          ELSE COALESCE(files, '[]'::jsonb) || to_jsonb($3::text)
        END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [transactionId, userId, fileId],
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Delete every file that is currently "orphan" (reviewed, no links anywhere).
 * Runs the same LATERAL-join orphan detection as getFiles so the criterion
 * matches the UI filter exactly. Returns the number of files removed.
 *
 * Caps at 5000 rows per call as a sanity guard — if a user somehow has more
 * orphans than that, they can click again; better than accidentally taking
 * 30s of disk unlinks in one transaction.
 */
export const deleteAllOrphanFiles = async (
  userId: string,
  entityId: string,
): Promise<{ deleted: number }> => {
  const pool = await getPool()
  const result = await pool.query(
    `SELECT f.*
     FROM files f
     LEFT JOIN LATERAL (
       SELECT 1 FROM transactions t
       WHERE t.user_id = f.user_id AND t.files ? f.id::text LIMIT 1
     ) lt ON TRUE
     LEFT JOIN LATERAL (
       SELECT 1 FROM invoices i
       WHERE i.user_id = f.user_id AND i.pdf_file_id = f.id LIMIT 1
     ) li ON TRUE
     LEFT JOIN LATERAL (
       SELECT 1 FROM import_sessions s
       WHERE s.user_id = f.user_id AND s.file_id = f.id LIMIT 1
     ) lis_src ON TRUE
     LEFT JOIN LATERAL (
       SELECT 1 FROM import_sessions s
       WHERE s.user_id = f.user_id AND s.context_file_ids ? f.id::text LIMIT 1
     ) lis_ctx ON TRUE
     LEFT JOIN LATERAL (
       SELECT 1 FROM personal_deductions pd
       WHERE pd.user_id = f.user_id AND pd.file_id = f.id LIMIT 1
     ) lpd ON TRUE
     WHERE f.user_id = $1
       AND f.is_reviewed = true
       AND lt IS NULL AND li IS NULL
       AND lis_src IS NULL AND lis_ctx IS NULL
       AND lpd IS NULL
     LIMIT 5000`,
    [userId],
  )

  if (result.rows.length === 0) return { deleted: 0 }

  const files = result.rows.map((r) => mapRow<File>(r))
  // Unlink on disk first, then the DB row. If disk unlink throws we still
  // delete the DB row — the orphan bytes would just sit until next cleanup,
  // and mirrors the single-file deleteFile() behavior above.
  for (const file of files) {
    try {
      await unlink(fullPathForFile(entityId, file))
    } catch (error) {
      console.error("Error deleting orphan file on disk:", error)
    }
  }

  const ids = files.map((f) => f.id)
  await pool.query(
    `DELETE FROM files WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids],
  )
  return { deleted: files.length }
}

export const deleteFile = async (id: string, userId: string, entityId: string) => {
  const pool = await getPool()
  const result = await pool.query(
    `SELECT * FROM files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )

  const firstRow = result.rows[0]
  if (!firstRow) return

  const file = mapRow<File>(firstRow)

  try {
    await unlink(fullPathForFile(entityId, file))
  } catch (error) {
    console.error("Error deleting file:", error)
  }

  await execute(sql`DELETE FROM files WHERE id = ${id} AND user_id = ${userId}`)
  return file
}
