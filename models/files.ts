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

export type FileWithLink = File & {
  linkedTransactionId: string | null
  linkedTransactionName: string | null
  linkedInvoiceId: string | null
  linkedInvoiceNumber: string | null
}

export type FilesListResult = {
  files: FileWithLink[]
  total: number
}

/**
 * Paginated list of every file this user owns, plus the linked-transaction
 * and linked-invoice pointers (if any), and filtering by status.
 *
 * A file is considered "linked" if either:
 *   - its id appears in any transaction's `files` jsonb array, OR
 *   - it is referenced by an invoice's `pdf_file_id`.
 *
 * `orphan` = reviewed but not linked to any transaction nor invoice.
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

  if (status === "unreviewed") {
    conditions.push("f.is_reviewed = false")
  } else if (status === "linked") {
    conditions.push("(lt.id IS NOT NULL OR li.id IS NOT NULL)")
  } else if (status === "orphan") {
    conditions.push("lt.id IS NULL AND li.id IS NULL AND f.is_reviewed = true")
  }

  const whereClause = conditions.join(" AND ")

  // Two LATERAL joins: one for the transaction that references this file in
  // its `files` jsonb array, and one for the invoice that has this file as
  // its `pdf_file_id`. Either (or both) makes the file "linked".
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
    WHERE ${whereClause}
  `

  params.push(pageSize)
  const limitPlaceholder = `$${params.length}`
  params.push(offset)
  const offsetPlaceholder = `$${params.length}`

  const rowsResult = await pool.query(
    `SELECT f.*,
            lt.id AS linked_transaction_id, lt.name AS linked_transaction_name,
            li.id AS linked_invoice_id, li.number AS linked_invoice_number
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
    return {
      ...file,
      linkedTransactionId: typeof linkedTxId === "string" ? linkedTxId : null,
      linkedTransactionName: typeof linkedTxName === "string" ? linkedTxName : null,
      linkedInvoiceId: typeof linkedInvId === "string" ? linkedInvId : null,
      linkedInvoiceNumber: typeof linkedInvNumber === "string" ? linkedInvNumber : null,
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
