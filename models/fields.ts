import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import { codeFromName } from "@/lib/utils"
import type { Field } from "@/lib/db-types"
import { cache } from "react"

export type FieldData = {
  [key: string]: unknown
}

export const getFields = cache(async (userId: string) => {
  return queryMany<Field>(
    sql`SELECT * FROM fields WHERE user_id = ${userId} ORDER BY created_at ASC`
  )
})

export const createField = async (userId: string, field: FieldData) => {
  if (!field["code"]) {
    field["code"] = codeFromName(field["name"] as string)
  }
  return queryOne<Field>(
    buildInsert("fields", { ...field, userId })
  )
}

export const updateField = async (userId: string, code: string, field: FieldData) => {
  return queryOne<Field>(
    buildUpdate("fields", field, "user_id = $1 AND code = $2", [userId, code])
  )
}

export const deleteField = async (userId: string, code: string) => {
  return queryOne<Field>(
    sql`DELETE FROM fields WHERE user_id = ${userId} AND code = ${code} RETURNING *`
  )
}
