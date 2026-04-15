import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { BusinessFact, BusinessFactValue } from "@/lib/db-types"

export async function listBusinessFacts(userId: string): Promise<BusinessFact[]> {
  return queryMany<BusinessFact>(
    sql`SELECT * FROM business_facts WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 200`,
  )
}

export async function getBusinessFact(userId: string, key: string): Promise<BusinessFact | null> {
  return queryOne<BusinessFact>(
    sql`SELECT * FROM business_facts WHERE user_id = ${userId} AND key = ${key}`,
  )
}

export type UpsertBusinessFactInput = {
  userId: string
  key: string
  value: BusinessFactValue
  source?: "wizard" | "user" | "inferred"
  learnedFromSessionId?: string | null
}

export async function upsertBusinessFact(input: UpsertBusinessFactInput): Promise<BusinessFact> {
  const valueJson = JSON.stringify(input.value)
  const source = input.source ?? "wizard"
  const sessionId = input.learnedFromSessionId ?? null

  const row = await queryOne<BusinessFact>(
    sql`INSERT INTO business_facts (user_id, key, value, source, learned_from_session_id)
        VALUES (${input.userId}, ${input.key}, ${valueJson}::jsonb, ${source}, ${sessionId})
        ON CONFLICT (user_id, key) DO UPDATE
          SET value = EXCLUDED.value,
              source = EXCLUDED.source,
              learned_from_session_id = COALESCE(EXCLUDED.learned_from_session_id, business_facts.learned_from_session_id),
              updated_at = now()
        RETURNING *`,
  )
  if (!row) throw new Error("upsertBusinessFact: insert returned no row")
  return row
}

export async function deleteBusinessFact(userId: string, key: string): Promise<void> {
  await execute(
    sql`DELETE FROM business_facts WHERE user_id = ${userId} AND key = ${key}`,
  )
}

export async function hasAnyBusinessFacts(userId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    sql`SELECT EXISTS(SELECT 1 FROM business_facts WHERE user_id = ${userId}) AS "exists"`,
  )
  return Boolean(row?.exists)
}
