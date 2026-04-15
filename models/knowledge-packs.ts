import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { KnowledgePack } from "@/lib/db-types"

export async function listPacks(userId: string): Promise<KnowledgePack[]> {
  return queryMany<KnowledgePack>(
    sql`SELECT * FROM knowledge_packs WHERE user_id = ${userId} ORDER BY slug ASC LIMIT 20`,
  )
}

export async function getPack(userId: string, slug: string): Promise<KnowledgePack | null> {
  return queryOne<KnowledgePack>(
    sql`SELECT * FROM knowledge_packs WHERE user_id = ${userId} AND slug = ${slug}`,
  )
}

export type UpsertKnowledgePackInput = {
  userId: string
  slug: string
  title: string
  content: string
  sourcePrompt?: string | null
  refreshIntervalDays?: number
  provider?: string | null
  model?: string | null
  reviewStatus?: "verified" | "needs_review" | "seed"
  markRefreshed?: boolean
}

export async function upsertPack(input: UpsertKnowledgePackInput): Promise<KnowledgePack> {
  const refreshInterval = input.refreshIntervalDays ?? 30
  const reviewStatus = input.reviewStatus ?? "verified"
  const lastRefreshedAt = input.markRefreshed ? new Date() : null

  const row = await queryOne<KnowledgePack>(
    sql`INSERT INTO knowledge_packs (
          user_id, slug, title, content, source_prompt,
          last_refreshed_at, refresh_interval_days, provider, model, review_status
        )
        VALUES (
          ${input.userId}, ${input.slug}, ${input.title}, ${input.content},
          ${input.sourcePrompt ?? null},
          ${lastRefreshedAt ? lastRefreshedAt.toISOString() : null},
          ${refreshInterval}, ${input.provider ?? null}, ${input.model ?? null}, ${reviewStatus}
        )
        ON CONFLICT (user_id, slug) DO UPDATE
          SET title = EXCLUDED.title,
              content = EXCLUDED.content,
              source_prompt = COALESCE(EXCLUDED.source_prompt, knowledge_packs.source_prompt),
              last_refreshed_at = COALESCE(EXCLUDED.last_refreshed_at, knowledge_packs.last_refreshed_at),
              refresh_interval_days = EXCLUDED.refresh_interval_days,
              provider = EXCLUDED.provider,
              model = EXCLUDED.model,
              review_status = EXCLUDED.review_status,
              updated_at = now()
        RETURNING *`,
  )
  if (!row) throw new Error("upsertPack: insert returned no row")
  return row
}

/**
 * Insert-only: used for seeding. Does nothing if the pack already exists
 * so repeat calls don't clobber user edits.
 */
export async function insertPackIfMissing(input: UpsertKnowledgePackInput): Promise<KnowledgePack | null> {
  const existing = await getPack(input.userId, input.slug)
  if (existing) return existing
  return upsertPack(input)
}

export async function setReviewStatus(
  userId: string,
  slug: string,
  status: "verified" | "needs_review" | "seed",
): Promise<void> {
  await execute(
    sql`UPDATE knowledge_packs
        SET review_status = ${status}, updated_at = now()
        WHERE user_id = ${userId} AND slug = ${slug}`,
  )
}

export async function deletePack(userId: string, slug: string): Promise<void> {
  await execute(
    sql`DELETE FROM knowledge_packs WHERE user_id = ${userId} AND slug = ${slug}`,
  )
}

export async function hasStalePack(userId: string): Promise<boolean> {
  const row = await queryOne<{ stale: boolean }>(
    sql`SELECT EXISTS(
          SELECT 1 FROM knowledge_packs
          WHERE user_id = ${userId}
            AND (last_refreshed_at IS NULL
                 OR last_refreshed_at < now() - (refresh_interval_days || ' days')::interval)
        ) AS "stale"`,
  )
  return Boolean(row?.stale)
}
