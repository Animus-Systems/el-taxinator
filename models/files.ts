"use server"

import { sql, queryMany, queryOne, buildInsert, buildUpdate, execute, mapRow } from "@/lib/sql"
import { getPool } from "@/lib/pg"
import type { File, User } from "@/lib/db-types"

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
import { fullPathForFile } from "@/lib/files"
import { unlink } from "fs/promises"
import { cache } from "react"
import { getTransactionById } from "./transactions"

export const getUnsortedFiles = cache(async (userId: string): Promise<File[]> => {
  return queryMany<File>(
    sql`SELECT * FROM files WHERE is_reviewed = false AND user_id = ${userId} ORDER BY created_at DESC LIMIT 500`
  )
})

export const getUnsortedFilesCount = cache(async (userId: string): Promise<number> => {
  const pool = await getPool()
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM files WHERE is_reviewed = false AND user_id = $1`,
    [userId]
  )
  return result.rows[0]?.count ?? 0
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

export const updateFile = async (id: string, userId: string, data: FileUpdateData): Promise<File> => {
  const result = await queryOne<File>(
    buildUpdate("files", data, "id = $1 AND user_id = $2", [id, userId])
  )
  return result!
}

export const deleteFile = async (id: string, userId: string) => {
  const pool = await getPool()
  // Fetch the file with its user (for building the full path)
  const result = await pool.query(
    `SELECT f.*, u.email AS user_email, u.name AS user_name, u.id AS uid,
            u.storage_used, u.storage_limit
     FROM files f
     JOIN users u ON u.id = f.user_id
     WHERE f.id = $1 AND f.user_id = $2`,
    [id, userId]
  )

  if (result.rows.length === 0) return

  const row = result.rows[0]
  const file = mapRow<File>(row)
  // Build a minimal user object for fullPathForFile
  const user = { email: row.user_email } as Pick<User, "email"> as User

  try {
    await unlink(fullPathForFile(user, file))
  } catch (error) {
    console.error("Error deleting file:", error)
  }

  await execute(sql`DELETE FROM files WHERE id = ${id} AND user_id = ${userId}`)
  return file
}
