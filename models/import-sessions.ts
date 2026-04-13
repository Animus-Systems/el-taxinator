import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { ImportSession } from "@/lib/db-types"
import { cache } from "react"

export type ImportSessionData = {
  accountId?: string | null
  fileName: string
  fileType: string
  rowCount: number
  data: unknown
  columnMapping?: unknown
  status?: string
  suggestedCategories?: unknown
}

export const getImportSessions = cache(async (userId: string) => {
  return queryMany<ImportSession>(
    sql`SELECT * FROM import_sessions WHERE user_id = ${userId} AND status = 'pending' ORDER BY created_at DESC`
  )
})

export const getImportSessionById = cache(async (id: string, userId: string) => {
  return queryOne<ImportSession>(
    sql`SELECT * FROM import_sessions WHERE id = ${id} AND user_id = ${userId}`
  )
})

export async function createImportSession(userId: string, data: ImportSessionData) {
  return queryOne<ImportSession>(
    buildInsert("import_sessions", { ...data, userId })
  )
}

export async function updateImportSession(id: string, userId: string, data: Partial<ImportSessionData>) {
  return queryOne<ImportSession>(
    buildUpdate("import_sessions", data, "id = $1 AND user_id = $2", [id, userId])
  )
}

export async function deleteImportSession(id: string, userId: string) {
  return queryOne<ImportSession>(
    sql`DELETE FROM import_sessions WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}

export async function cleanupExpiredSessions(userId: string) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return queryMany<ImportSession>(
    sql`DELETE FROM import_sessions WHERE user_id = ${userId} AND status = 'pending' AND created_at < ${oneDayAgo} RETURNING *`
  )
}
