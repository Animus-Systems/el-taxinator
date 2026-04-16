import { getPool } from "@/lib/pg"
import { randomUUID } from "crypto"
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  DEFAULT_FIELDS,
  DEFAULT_PROJECTS,
  DEFAULT_SETTINGS,
} from "./defaults"

export async function createUserDefaults(userId: string) {
  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    for (const project of DEFAULT_PROJECTS) {
      await client.query(
        `INSERT INTO projects (id, user_id, code, name, color, llm_prompt)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, code) DO UPDATE
           SET name = EXCLUDED.name, color = EXCLUDED.color, llm_prompt = EXCLUDED.llm_prompt`,
        [randomUUID(), userId, project.code, project.name, project.color, project.llmPrompt],
      )
    }

    for (const category of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO categories (id, user_id, code, name, color, llm_prompt)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, code) DO UPDATE
           SET name = EXCLUDED.name, color = EXCLUDED.color, llm_prompt = EXCLUDED.llm_prompt`,
        [randomUUID(), userId, category.code, category.name, category.color, category.llmPrompt],
      )
    }

    for (const currency of DEFAULT_CURRENCIES) {
      await client.query(
        `INSERT INTO currencies (id, user_id, code, name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, code) DO UPDATE
           SET name = EXCLUDED.name`,
        [randomUUID(), userId, currency.code, currency.name],
      )
    }

    for (const field of DEFAULT_FIELDS) {
      await client.query(
        `INSERT INTO fields (id, user_id, code, name, type, llm_prompt, is_visible_in_list, is_visible_in_analysis, is_required, is_extra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, code) DO UPDATE
           SET name = EXCLUDED.name,
               type = EXCLUDED.type,
               llm_prompt = EXCLUDED.llm_prompt,
               is_visible_in_list = EXCLUDED.is_visible_in_list,
               is_visible_in_analysis = EXCLUDED.is_visible_in_analysis,
               is_required = EXCLUDED.is_required,
               is_extra = EXCLUDED.is_extra`,
        [
          randomUUID(),
          userId,
          field.code,
          field.name,
          field.type,
          field.llmPrompt,
          field.isVisibleInList,
          field.isVisibleInAnalysis,
          field.isRequired,
          field.isExtra,
        ],
      )
    }

    for (const setting of DEFAULT_SETTINGS) {
      await client.query(
        `INSERT INTO settings (id, user_id, code, name, description, value)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, code) DO UPDATE
           SET name = EXCLUDED.name, description = EXCLUDED.description, value = EXCLUDED.value`,
        [randomUUID(), userId, setting.code, setting.name, setting.description ?? null, setting.value ?? null],
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  // Seed Canary Islands knowledge packs outside the main transaction so a
  // disk/fs error on the seed markdown doesn't roll back the user's defaults.
  // `seedKnowledgePacksForUser` is idempotent (only inserts missing slugs).
  try {
    const { seedKnowledgePacksForUser } = await import("@/ai/knowledge-refresh")
    await seedKnowledgePacksForUser(userId)
  } catch (err) {
    console.warn("[defaults] knowledge pack seeding skipped:", err instanceof Error ? err.message : err)
  }
}

export async function isDatabaseEmpty(userId: string) {
  const pool = await getPool()
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM fields WHERE user_id = $1`,
    [userId],
  )
  return (result.rows[0]?.["count"] ?? 0) === 0
}
