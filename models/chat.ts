import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { ChatMessage, ChatMessageRole, ChatMessageStatus, ChatMessageMetadata } from "@/lib/db-types"

export async function listChatMessages(userId: string): Promise<ChatMessage[]> {
  return queryMany<ChatMessage>(
    sql`SELECT * FROM chat_messages WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 200`,
  )
}

export async function createChatMessage(
  userId: string,
  role: ChatMessageRole,
  content: string,
  metadata: ChatMessageMetadata | null,
  status: ChatMessageStatus,
): Promise<ChatMessage> {
  const metaJson = metadata === null ? null : JSON.stringify(metadata)
  const row = await queryOne<ChatMessage>(
    sql`INSERT INTO chat_messages (user_id, role, content, metadata, status)
        VALUES (${userId}, ${role}, ${content}, ${metaJson}::jsonb, ${status})
        RETURNING *`,
  )
  if (!row) throw new Error("createChatMessage: insert returned no row")
  return row
}

export async function markMessageApplied(userId: string, messageId: string): Promise<ChatMessage | null> {
  return queryOne<ChatMessage>(
    sql`UPDATE chat_messages SET applied_at = now()
        WHERE id = ${messageId} AND user_id = ${userId}
        RETURNING *`,
  )
}

export async function clearChatMessages(userId: string): Promise<number> {
  return execute(sql`DELETE FROM chat_messages WHERE user_id = ${userId}`)
}

export async function upsertChatSummary(
  userId: string,
  content: string,
  summaryOfCount: number,
): Promise<ChatMessage> {
  const metaJson = JSON.stringify({ summaryOfCount })
  // The partial unique index on (user_id) WHERE role='system' is our conflict target.
  const row = await queryOne<ChatMessage>(
    sql`INSERT INTO chat_messages (user_id, role, content, metadata, status)
        VALUES (${userId}, 'system', ${content}, ${metaJson}::jsonb, 'sent')
        ON CONFLICT (user_id) WHERE role = 'system'
        DO UPDATE SET content = EXCLUDED.content,
                      metadata = EXCLUDED.metadata,
                      created_at = now()
        RETURNING *`,
  )
  if (!row) throw new Error("upsertChatSummary: insert returned no row")
  return row
}

export async function deleteOldestChatMessages(userId: string, limit: number): Promise<number> {
  return execute(
    sql`DELETE FROM chat_messages
        WHERE id IN (
          SELECT id FROM chat_messages
          WHERE user_id = ${userId} AND role IN ('user', 'assistant')
          ORDER BY created_at ASC
          LIMIT ${limit}
        )`,
  )
}

export async function countActiveChatMessages(userId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM chat_messages
        WHERE user_id = ${userId} AND role IN ('user', 'assistant')`,
  )
  return row?.count ?? 0
}

export async function loadOldestChatMessages(userId: string, limit: number): Promise<ChatMessage[]> {
  return queryMany<ChatMessage>(
    sql`SELECT * FROM chat_messages
        WHERE user_id = ${userId} AND role IN ('user', 'assistant')
        ORDER BY created_at ASC
        LIMIT ${limit}`,
  )
}

export async function getChatSummary(userId: string): Promise<ChatMessage | null> {
  return queryOne<ChatMessage>(
    sql`SELECT * FROM chat_messages WHERE user_id = ${userId} AND role = 'system'`,
  )
}
