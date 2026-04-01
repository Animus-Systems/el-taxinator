"use server"

import { getPool } from "@/lib/pg"
import { DEFAULT_CATEGORIES, DEFAULT_CURRENCIES, DEFAULT_FIELDS, DEFAULT_SETTINGS } from "@/models/defaults"
import type { User } from "@/lib/db-types"
import { redirect } from "next/navigation"

export async function resetLLMSettings(user: User) {
  const pool = await getPool()
  const llmSettings = DEFAULT_SETTINGS.filter((setting) => setting.code === "prompt_analyse_new_file")

  for (const setting of llmSettings) {
    await pool.query(
      `INSERT INTO settings (id, user_id, code, name, description, value)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (user_id, code) DO UPDATE SET value = EXCLUDED.value`,
      [user.id, setting.code, setting.name, setting.description ?? null, setting.value ?? null]
    )
  }

  redirect("/settings/llm")
}

export async function resetFieldsAndCategories(user: User) {
  const pool = await getPool()
  // Reset categories
  for (const category of DEFAULT_CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (id, user_id, code, name, color, llm_prompt, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, code) DO UPDATE SET
         name = EXCLUDED.name, color = EXCLUDED.color,
         llm_prompt = EXCLUDED.llm_prompt, created_at = NOW()`,
      [user.id, category.code, category.name, category.color, category.llmPrompt ?? null]
    )
  }
  const categoryCodes = DEFAULT_CATEGORIES.map((c) => c.code)
  await pool.query(
    `DELETE FROM categories WHERE user_id = $1 AND code != ALL($2::text[])`,
    [user.id, categoryCodes]
  )

  // Reset currencies
  for (const currency of DEFAULT_CURRENCIES) {
    await pool.query(
      `INSERT INTO currencies (id, user_id, code, name)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [user.id, currency.code, currency.name]
    )
  }
  const currencyCodes = DEFAULT_CURRENCIES.map((c) => c.code)
  await pool.query(
    `DELETE FROM currencies WHERE user_id = $1 AND code != ALL($2::text[])`,
    [user.id, currencyCodes]
  )

  // Reset fields
  for (const field of DEFAULT_FIELDS) {
    await pool.query(
      `INSERT INTO fields (id, user_id, code, name, type, llm_prompt, created_at,
         is_visible_in_list, is_visible_in_analysis, is_required, is_extra)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
       ON CONFLICT (user_id, code) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type,
         llm_prompt = EXCLUDED.llm_prompt, created_at = NOW(),
         is_visible_in_list = EXCLUDED.is_visible_in_list,
         is_visible_in_analysis = EXCLUDED.is_visible_in_analysis,
         is_required = EXCLUDED.is_required,
         is_extra = EXCLUDED.is_extra`,
      [
        user.id,
        field.code,
        field.name,
        field.type,
        field.llmPrompt ?? null,
        field.isVisibleInList,
        field.isVisibleInAnalysis,
        field.isRequired,
        field.isExtra,
      ]
    )
  }
  const fieldCodes = DEFAULT_FIELDS.map((f) => f.code)
  await pool.query(
    `DELETE FROM fields WHERE user_id = $1 AND code != ALL($2::text[])`,
    [user.id, fieldCodes]
  )

  redirect("/settings/fields")
}
