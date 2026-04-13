import { sql, queryMany, queryOne, execute, buildInsert } from "@/lib/sql"
import type { PastSearch, PastSearchCreateInput, SearchResultItem } from "@/lib/db-types"

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPastSearch(input: PastSearchCreateInput): Promise<PastSearch> {
  const results: SearchResultItem[] = input.results ?? []
  const row = await queryOne<PastSearch>(
    buildInsert("past_searches", {
      userId: input.userId,
      query: input.query,
      topic: input.topic,
      results,
      resultCount: results.length,
    }),
  )
  return row!
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** List past searches for a user, optionally filtered by topic, ordered newest first. */
export async function listPastSearches(
  userId: string,
  topic?: string,
  limit = 20,
): Promise<PastSearch[]> {
  const where = topic
    ? sql`WHERE user_id = ${userId} AND topic = ${topic}`
    : sql`WHERE user_id = ${userId}`

  return queryMany<PastSearch>(
    sql`SELECT * FROM past_searches ${where} ORDER BY created_at DESC LIMIT ${limit}`,
  )
}

/** Get the most recent past search for a given topic. */
export async function getLatestPastSearch(
  userId: string,
  topic: string,
): Promise<PastSearch | null> {
  return queryOne<PastSearch>(
    sql`SELECT * FROM past_searches
        WHERE user_id = ${userId} AND topic = ${topic}
        ORDER BY created_at DESC
        LIMIT 1`,
  )
}

/** Get a single past search by ID (scoped to user). */
export async function getPastSearch(
  userId: string,
  id: string,
): Promise<PastSearch | null> {
  return queryOne<PastSearch>(
    sql`SELECT * FROM past_searches WHERE user_id = ${userId} AND id = ${id}`,
  )
}

// ---------------------------------------------------------------------------
// Diff — find new results not present in a previous search
// ---------------------------------------------------------------------------

/**
 * Compares a set of current results against a previous search and returns
 * only the items that are new (i.e. their URL was not in the previous search).
 *
 * This is the core mechanism for "only show new developments".
 */
export function diffResults(
  previous: SearchResultItem[],
  current: SearchResultItem[],
): SearchResultItem[] {
  const knownUrls = new Set(previous.map((r) => r.url))
  return current.filter((r) => !knownUrls.has(r.url))
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete a past search by ID (scoped to user). */
export async function deletePastSearch(userId: string, id: string): Promise<number> {
  return execute(
    sql`DELETE FROM past_searches WHERE user_id = ${userId} AND id = ${id}`,
  )
}

/** Delete all past searches for a given topic (scoped to user). */
export async function deletePastSearchesByTopic(userId: string, topic: string): Promise<number> {
  return execute(
    sql`DELETE FROM past_searches WHERE user_id = ${userId} AND topic = ${topic}`,
  )
}