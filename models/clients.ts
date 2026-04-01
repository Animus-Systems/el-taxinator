import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { Client } from "@/lib/db-types"
import { cache } from "react"

export type ClientData = {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  taxId?: string | null
  notes?: string | null
}

export const getClients = cache(async (userId: string) => {
  return queryMany<Client>(
    sql`SELECT * FROM clients WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getClientById = cache(async (id: string, userId: string) => {
  return queryOne<Client>(
    sql`SELECT * FROM clients WHERE id = ${id} AND user_id = ${userId}`
  )
})

export async function createClient(userId: string, data: ClientData) {
  return queryOne<Client>(
    buildInsert("clients", { ...data, userId })
  )
}

export async function updateClient(id: string, userId: string, data: ClientData) {
  return queryOne<Client>(
    buildUpdate("clients", { ...data, updatedAt: new Date() }, "id = $1 AND user_id = $2", [id, userId])
  )
}

export async function deleteClient(id: string, userId: string) {
  return queryOne<Client>(
    sql`DELETE FROM clients WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}
