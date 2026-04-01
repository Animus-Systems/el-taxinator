import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { Product } from "@/lib/db-types"
import { cache } from "react"

export type ProductData = {
  name: string
  description?: string | null
  price: number
  currencyCode?: string
  vatRate?: number
  unit?: string | null
}

export const getProducts = cache(async (userId: string) => {
  return queryMany<Product>(
    sql`SELECT * FROM products WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getProductById = cache(async (id: string, userId: string) => {
  return queryOne<Product>(
    sql`SELECT * FROM products WHERE id = ${id} AND user_id = ${userId}`
  )
})

export async function createProduct(userId: string, data: ProductData) {
  return queryOne<Product>(
    buildInsert("products", { ...data, userId })
  )
}

export async function updateProduct(id: string, userId: string, data: ProductData) {
  return queryOne<Product>(
    buildUpdate("products", { ...data, updatedAt: new Date() }, "id = $1 AND user_id = $2", [id, userId])
  )
}

export async function deleteProduct(id: string, userId: string) {
  return queryOne<Product>(
    sql`DELETE FROM products WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}
