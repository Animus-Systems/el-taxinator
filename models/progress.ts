import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { Progress } from "@/lib/db-types"

export const getOrCreateProgress = async (
  userId: string,
  id: string,
  type: string | null = null,
  data: any = null,
  total: number = 0
) => {
  // Try to find existing first
  const existing = await queryOne<Progress>(
    sql`SELECT * FROM progress WHERE id = ${id}`
  )
  if (existing) return existing

  return await queryOne<Progress>(
    sql`INSERT INTO progress (id, user_id, type, data, total)
        VALUES (${id}, ${userId}, ${type || "unknown"}, ${data ? JSON.stringify(data) : null}, ${total})
        ON CONFLICT (id) DO NOTHING
        RETURNING *`
  ) ?? existing
}

export const getProgressById = async (userId: string, id: string) => {
  return await queryOne<Progress>(
    sql`SELECT * FROM progress WHERE id = ${id} AND user_id = ${userId}`
  )
}

export const updateProgress = async (
  userId: string,
  id: string,
  fields: { current?: number; total?: number; data?: any }
) => {
  const setClauses: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (fields.current !== undefined) {
    setClauses.push(`current = $${paramIdx++}`)
    values.push(fields.current)
  }
  if (fields.total !== undefined) {
    setClauses.push(`total = $${paramIdx++}`)
    values.push(fields.total)
  }
  if (fields.data !== undefined) {
    setClauses.push(`data = $${paramIdx++}`)
    values.push(fields.data ? JSON.stringify(fields.data) : null)
  }

  if (setClauses.length === 0) return { count: 0 }

  values.push(id, userId)
  const text = `UPDATE progress SET ${setClauses.join(", ")} WHERE id = $${paramIdx++} AND user_id = $${paramIdx++}`
  const result = await execute({ text, values })
  return { count: result }
}

export const incrementProgress = async (userId: string, id: string, amount: number = 1) => {
  const result = await execute(
    sql`UPDATE progress SET current = current + ${amount} WHERE id = ${id} AND user_id = ${userId}`
  )
  return { count: result }
}

export const getAllProgressByUser = async (userId: string) => {
  return await queryMany<Progress>(
    sql`SELECT * FROM progress WHERE user_id = ${userId} ORDER BY created_at DESC`
  )
}

export const deleteProgress = async (userId: string, id: string) => {
  const result = await execute(
    sql`DELETE FROM progress WHERE id = ${id} AND user_id = ${userId}`
  )
  return { count: result }
}
