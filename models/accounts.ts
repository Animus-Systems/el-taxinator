import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { AccountTypeValue, BankAccount } from "@/lib/db-types"
import { cache } from "react"

export type AccountData = {
  name: string
  bankName?: string | null
  currencyCode: string
  accountNumber?: string | null
  notes?: string | null
  accountType?: AccountTypeValue
  isActive?: boolean
}

export const getAccounts = cache(async (userId: string) => {
  return queryMany<BankAccount>(
    sql`SELECT * FROM accounts WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getActiveAccounts = cache(async (userId: string) => {
  return queryMany<BankAccount>(
    sql`SELECT * FROM accounts WHERE user_id = ${userId} AND is_active = true ORDER BY name ASC`
  )
})

export const getAccountById = cache(async (id: string, userId: string) => {
  return queryOne<BankAccount>(
    sql`SELECT * FROM accounts WHERE id = ${id} AND user_id = ${userId}`
  )
})

export async function createAccount(userId: string, data: AccountData) {
  return queryOne<BankAccount>(
    buildInsert("accounts", { ...data, userId })
  )
}

export async function updateAccount(id: string, userId: string, data: Partial<AccountData>) {
  return queryOne<BankAccount>(
    buildUpdate("accounts", { ...data, updatedAt: new Date() }, "id = $1 AND user_id = $2", [id, userId])
  )
}

export async function deleteAccount(id: string, userId: string) {
  return queryOne<BankAccount>(
    sql`DELETE FROM accounts WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}
