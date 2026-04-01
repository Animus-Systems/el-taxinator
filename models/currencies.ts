import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { Currency, CurrencyCreateInput } from "@/lib/db-types"
import { cache } from "react"

export const getCurrencies = cache(async (userId: string) => {
  return await queryMany<Currency>(
    sql`SELECT * FROM currencies WHERE user_id = ${userId} ORDER BY code ASC`
  )
})

export const createCurrency = async (userId: string, currency: CurrencyCreateInput) => {
  return await queryOne<Currency>(
    buildInsert("currencies", { ...currency, userId })
  )
}

export const updateCurrency = async (userId: string, code: string, currency: Partial<CurrencyCreateInput>) => {
  return await queryOne<Currency>(
    buildUpdate("currencies", currency, "user_id = $1 AND code = $2", [userId, code])
  )
}

export const deleteCurrency = async (userId: string, code: string) => {
  return await queryOne<Currency>(
    sql`DELETE FROM currencies WHERE user_id = ${userId} AND code = ${code} RETURNING *`
  )
}
