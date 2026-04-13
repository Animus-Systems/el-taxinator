import { sql, queryOne, mapRow, camelToSnake } from "@/lib/sql"
import { getPool } from "@/lib/pg"
import type { User } from "@/lib/db-types"
import { randomUUID } from "crypto"
import { cache } from "react"
import { createUserDefaults, isDatabaseEmpty } from "./defaults-server"

export const SELF_HOSTED_USER = {
  email: "taxhacker@localhost",
  name: "Self-Hosted Mode",
  membershipPlan: "unlimited",
}

export async function getSelfHostedUser() {
  return await queryOne<User>(
    sql`SELECT * FROM users WHERE email = ${SELF_HOSTED_USER.email}`
  )
}

export async function getOrCreateSelfHostedUser(): Promise<User> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const user = await queryOne<User>(
    sql`INSERT INTO users (id, email, name, membership_plan, created_at, updated_at)
        VALUES (${id}, ${SELF_HOSTED_USER.email}, ${SELF_HOSTED_USER.name}, ${SELF_HOSTED_USER.membershipPlan}, ${now}, ${now})
        ON CONFLICT (email)
        DO UPDATE SET name = ${SELF_HOSTED_USER.name}, membership_plan = ${SELF_HOSTED_USER.membershipPlan}, updated_at = ${now}
        RETURNING *`
  )
  if (user && await isDatabaseEmpty(user.id)) {
    await createUserDefaults(user.id)
  }
  return user!
}

export async function getOrCreateCloudUser(email: string, data: Record<string, unknown>): Promise<User> {
  if (!data.id) data.id = randomUUID()
  const pool = await getPool()
  // Build dynamic column lists from the data object
  const insertCols: string[] = []
  const insertPlaceholders: string[] = []
  const updateClauses: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const col = camelToSnake(key)
    values.push(value instanceof Date ? value.toISOString() : value)
    const idx = values.length
    insertCols.push(col)
    insertPlaceholders.push(`$${idx}`)
    // Don't overwrite email on update (it's the conflict key)
    if (col !== "email") {
      updateClauses.push(`${col} = $${idx}`)
    }
  }

  // Always set updated_at on conflict
  updateClauses.push("updated_at = NOW()")

  const text = `INSERT INTO users (${insertCols.join(", ")}) VALUES (${insertPlaceholders.join(", ")}) ON CONFLICT (email) DO UPDATE SET ${updateClauses.join(", ")} RETURNING *`

  const result = await pool.query(text, values)
  const user = mapRow<User>(result.rows[0])

  if (await isDatabaseEmpty(user.id)) {
    await createUserDefaults(user.id)
  }

  return user
}

export const getUserById = cache(async (id: string) => {
  return await queryOne<User>(
    sql`SELECT * FROM users WHERE id = ${id}`
  )
})

export const getUserByEmail = cache(async (email: string) => {
  return await queryOne<User>(
    sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`
  )
})

export const getUserByStripeCustomerId = cache(async (customerId: string) => {
  return await queryOne<User>(
    sql`SELECT * FROM users WHERE stripe_customer_id = ${customerId}`
  )
})

/**
 * Updates a user by ID. Supports plain values and
 * `{ increment: n }` / `{ decrement: n }` operators for numeric columns.
 */
export function updateUser(userId: string, data: Record<string, unknown>) {
  const setClauses: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const col = camelToSnake(key)

    // Handle increment/decrement operators
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const op = value as Record<string, unknown>
      if ("increment" in op) {
        setClauses.push(`${col} = ${col} + $${values.length + 1}`)
        values.push(op.increment)
        continue
      }
      if ("decrement" in op) {
        setClauses.push(`${col} = ${col} - $${values.length + 1}`)
        values.push(op.decrement)
        continue
      }
    }

    values.push(value instanceof Date ? value.toISOString() : value)
    setClauses.push(`${col} = $${values.length}`)
  }

  // Always set updated_at
  setClauses.push(`updated_at = NOW()`)

  values.push(userId)
  const text = `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`
  return queryOne<User>({ text, values })
}
