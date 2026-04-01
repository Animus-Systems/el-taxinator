import { sql, queryMany, queryOne, buildInsert, buildUpdate, execute } from "@/lib/sql"
import { codeFromName } from "@/lib/utils"
import type { Category } from "@/lib/db-types"
import { cache } from "react"

export type CategoryData = {
  [key: string]: unknown
}

export const getCategories = cache(async (userId: string) => {
  return queryMany<Category>(
    sql`SELECT * FROM categories WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getCategoryByCode = cache(async (userId: string, code: string) => {
  return queryOne<Category>(
    sql`SELECT * FROM categories WHERE user_id = ${userId} AND code = ${code}`
  )
})

export const createCategory = async (userId: string, category: CategoryData) => {
  if (!category.code) {
    category.code = codeFromName(category.name as string)
  }
  return queryOne<Category>(
    buildInsert("categories", { ...category, userId })
  )
}

export const updateCategory = async (userId: string, code: string, category: CategoryData) => {
  return queryOne<Category>(
    buildUpdate("categories", category, "user_id = $1 AND code = $2", [userId, code])
  )
}

export const deleteCategory = async (userId: string, code: string) => {
  // Set category_code to null on related transactions
  await execute(
    sql`UPDATE transactions SET category_code = NULL WHERE user_id = ${userId} AND category_code = ${code}`
  )

  return queryOne<Category>(
    sql`DELETE FROM categories WHERE user_id = ${userId} AND code = ${code} RETURNING *`
  )
}
