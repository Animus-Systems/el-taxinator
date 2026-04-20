import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { Contact } from "@/lib/db-types"
import { cache } from "react"

/**
 * A party the user transacts with (customer via invoices/quotes, supplier
 * via purchases, or both). Historically modelled as "clients"; renamed to
 * "contacts" in schema v27 so the same row backs both ledger sides.
 */
export type ContactRole = "client" | "supplier" | "both"
export type ContactKind = "company" | "person"

export type ContactData = {
  name: string
  email?: string | null
  phone?: string | null
  mobile?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  province?: string | null
  country?: string | null
  taxId?: string | null
  bankDetails?: string | null
  notes?: string | null
  role?: ContactRole
  kind?: ContactKind
}

export const getContacts = cache(async (userId: string) => {
  return queryMany<Contact>(
    sql`SELECT * FROM contacts WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getContactById = cache(async (id: string, userId: string) => {
  return queryOne<Contact>(
    sql`SELECT * FROM contacts WHERE id = ${id} AND user_id = ${userId}`
  )
})

export async function createContact(userId: string, data: ContactData) {
  return queryOne<Contact>(
    buildInsert("contacts", { ...data, userId })
  )
}

export async function updateContact(id: string, userId: string, data: ContactData) {
  return queryOne<Contact>(
    buildUpdate("contacts", { ...data, updatedAt: new Date() }, "id = $1 AND user_id = $2", [id, userId])
  )
}

export async function deleteContact(id: string, userId: string) {
  return queryOne<Contact>(
    sql`DELETE FROM contacts WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}
