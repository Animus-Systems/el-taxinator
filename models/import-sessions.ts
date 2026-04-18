import { sql, queryMany, queryOne, execute, buildInsert, buildUpdate } from "@/lib/sql"
import type { ImportSession, WizardMessage } from "@/lib/db-types"
import { cache } from "react"

export type ImportSessionData = {
  accountId?: string | null
  fileId?: string | null
  fileName?: string | null
  fileType?: string | null
  rowCount?: number
  data?: unknown
  columnMapping?: unknown
  status?: string
  suggestedCategories?: unknown
  entryMode?: string
  messages?: WizardMessage[]
  businessContextSnapshot?: unknown
  promptVersion?: string | null
  title?: string | null
  contextFileIds?: string[]
}

export const getImportSessions = cache(async (userId: string) => {
  return queryMany<ImportSession>(
    sql`SELECT * FROM import_sessions WHERE user_id = ${userId} AND status = 'pending' ORDER BY last_activity_at DESC`
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
    buildUpdate(
      "import_sessions",
      { ...data, lastActivityAt: new Date() },
      "id = $1 AND user_id = $2",
      [id, userId],
    ),
  )
}

export async function deleteImportSession(id: string, userId: string) {
  return queryOne<ImportSession>(
    sql`DELETE FROM import_sessions WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}

export async function cleanupExpiredSessions(userId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return queryMany<ImportSession>(
    sql`UPDATE import_sessions
        SET status = 'abandoned'
        WHERE user_id = ${userId}
          AND status = 'pending'
          AND last_activity_at < ${sevenDaysAgo}
        RETURNING *`,
  )
}

// ---------------------------------------------------------------------------
// Resumable session listing
// ---------------------------------------------------------------------------

export type ResumableSessionSummary = {
  id: string
  title: string | null
  entryMode: string
  fileName: string | null
  fileType: string | null
  lastActivityAt: Date
  candidateCount: number
  unresolvedCount: number
  pendingTurnAt: Date | null
}

export async function listResumableSessions(userId: string): Promise<ResumableSessionSummary[]> {
  return listSessionsByStatus(userId, "pending")
}

export async function listArchivedSessions(userId: string): Promise<ResumableSessionSummary[]> {
  return listSessionsByStatus(userId, "abandoned")
}

export async function listCommittedSessions(userId: string): Promise<ResumableSessionSummary[]> {
  return listSessionsByStatus(userId, "committed")
}

async function listSessionsByStatus(
  userId: string,
  status: "pending" | "abandoned" | "committed",
): Promise<ResumableSessionSummary[]> {
  const rows = await queryMany<ImportSession>(
    sql`SELECT * FROM import_sessions
        WHERE user_id = ${userId} AND status = ${status}
        ORDER BY last_activity_at DESC
        LIMIT 50`,
  )
  return rows.map((session) => {
    const candidates = Array.isArray(session.data) ? (session.data as Array<{ status?: string }>) : []
    const unresolved = candidates.filter((c) => !c?.status || c.status === "needs_review").length
    return {
      id: session.id,
      title: session.title,
      entryMode: session.entryMode,
      fileName: session.fileName,
      fileType: session.fileType,
      lastActivityAt: session.lastActivityAt,
      candidateCount: candidates.length,
      unresolvedCount: unresolved,
      pendingTurnAt: session.pendingTurnAt,
    }
  })
}

export async function reopenSession(sessionId: string, userId: string): Promise<void> {
  await execute(
    sql`UPDATE import_sessions
        SET status = 'pending',
            last_activity_at = now()
        WHERE id = ${sessionId} AND user_id = ${userId} AND status = 'abandoned'`,
  )
}

// ---------------------------------------------------------------------------
// Conversation helpers (atomic message append + pending-turn lock)
// ---------------------------------------------------------------------------

/**
 * Append a single message to messages JSONB in one statement.
 * Concurrency note: the pending_turn_at lock (see beginTurn / endTurn) prevents
 * concurrent writers from racing on the same session.
 */
export async function appendMessage(
  sessionId: string,
  userId: string,
  message: WizardMessage,
): Promise<void> {
  const messageJson = JSON.stringify(message)
  await execute(
    sql`UPDATE import_sessions
        SET messages = messages || ${messageJson}::jsonb,
            last_activity_at = now()
        WHERE id = ${sessionId} AND user_id = ${userId}`,
  )
}

/**
 * Atomically claim the per-session turn lock. Returns true if claimed,
 * false if another turn is already in flight (caller should return 409).
 */
export async function beginTurn(sessionId: string, userId: string): Promise<boolean> {
  const updated = await execute(
    sql`UPDATE import_sessions
        SET pending_turn_at = now(),
            last_activity_at = now()
        WHERE id = ${sessionId}
          AND user_id = ${userId}
          AND pending_turn_at IS NULL
          AND status = 'pending'`,
  )
  return updated > 0
}

/** Clear the per-session turn lock. Safe to call even if no lock is held. */
export async function endTurn(sessionId: string, userId: string): Promise<void> {
  await execute(
    sql`UPDATE import_sessions
        SET pending_turn_at = NULL,
            last_activity_at = now()
        WHERE id = ${sessionId} AND user_id = ${userId}`,
  )
}

/** Force-clear a stale lock (for "another tab is sending — steal lock" UX). */
export async function stealLock(sessionId: string, userId: string): Promise<void> {
  await execute(
    sql`UPDATE import_sessions
        SET pending_turn_at = NULL
        WHERE id = ${sessionId} AND user_id = ${userId}`,
  )
}

export async function setBusinessContextSnapshot(
  sessionId: string,
  userId: string,
  snapshot: unknown,
): Promise<void> {
  await execute(
    sql`UPDATE import_sessions
        SET business_context_snapshot = ${JSON.stringify(snapshot)}::jsonb,
            last_activity_at = now()
        WHERE id = ${sessionId} AND user_id = ${userId}`,
  )
}

export async function abandonSession(sessionId: string, userId: string): Promise<void> {
  await execute(
    sql`UPDATE import_sessions
        SET status = 'abandoned',
            pending_turn_at = NULL,
            last_activity_at = now()
        WHERE id = ${sessionId} AND user_id = ${userId}`,
  )
}
