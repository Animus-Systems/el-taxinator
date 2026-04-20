import { getPool } from "@/lib/pg"
import {
  sql,
  queryOne,
  buildInsert,
  buildUpdate,
  execute,
  mapRow,
  withTransaction,
  mapProductFromRow,
  assertSafeIdentifier,
} from "@/lib/sql"
import type {
  Purchase,
  PurchaseItem,
  Contact,
  Product,
} from "@/lib/db-types"
import type { PoolClient } from "pg"
import { cache } from "react"

export type PurchaseItemData = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

export type PurchaseData = {
  contactId?: string | null
  pdfFileId?: string | null
  supplierInvoiceNumber: string
  status?: string
  issueDate: Date
  dueDate?: Date | null
  currencyCode?: string
  irpfRate?: number
  notes?: string | null
  items: PurchaseItemData[]
}

export type PurchaseWithRelations = Purchase & {
  contact: Contact | null
  items: (PurchaseItem & { product?: Product | null })[]
}

export type PurchaseListFilters = {
  dateFrom?: string
  dateTo?: string
  status?: string[]
}

const PRODUCT_JOIN_COLUMNS = `
  pr.id AS prod_id, pr.user_id AS prod_user_id, pr.name AS prod_name,
  pr.description AS prod_description, pr.price AS prod_price,
  pr.currency_code AS prod_currency_code, pr.vat_rate AS prod_vat_rate,
  pr.unit AS prod_unit, pr.created_at AS prod_created_at, pr.updated_at AS prod_updated_at`

function firstRowOrThrow<T>(rows: Record<string, unknown>[], context: string): T {
  const row = rows[0]
  if (!row) throw new Error(`Expected row from ${context}`)
  return mapRow<T>(row)
}

async function fetchContactInTx(
  txClient: PoolClient,
  contactId: string | null | undefined,
): Promise<Contact | null> {
  if (!contactId) return null
  const result = await txClient.query(`SELECT * FROM contacts WHERE id = $1`, [contactId])
  const row = result.rows[0]
  return row ? mapRow<Contact>(row) : null
}

async function fetchContact(contactId: string | null | undefined): Promise<Contact | null> {
  if (!contactId) return null
  return queryOne<Contact>(sql`SELECT * FROM contacts WHERE id = ${contactId}`)
}

async function insertItems(
  txClient: PoolClient,
  items: PurchaseItemData[],
  purchaseId: string,
): Promise<PurchaseItem[]> {
  const inserted: PurchaseItem[] = []
  for (const item of items) {
    const itemInsert = buildInsert("purchase_items", {
      ...item,
      purchaseId,
    })
    const result = await txClient.query(itemInsert.text, itemInsert.values)
    inserted.push(firstRowOrThrow<PurchaseItem>(result.rows, "insert purchase_items"))
  }
  return inserted
}

/**
 * Look up a purchase by (user, contact, supplier invoice number) — the
 * business-key used to enforce no-duplicates on create. Contact is part of
 * the key so two different suppliers can share an invoice number.
 * Returns the first matching id, or null.
 */
export async function findDuplicatePurchase(
  userId: string,
  contactId: string | null,
  supplierInvoiceNumber: string,
): Promise<{ id: string } | null> {
  const trimmed = supplierInvoiceNumber.trim()
  if (!trimmed) return null
  const result = contactId
    ? await queryOne<{ id: string }>(sql`
        SELECT id FROM purchases
        WHERE user_id = ${userId}
          AND contact_id = ${contactId}
          AND LOWER(supplier_invoice_number) = LOWER(${trimmed})
        LIMIT 1`)
    : await queryOne<{ id: string }>(sql`
        SELECT id FROM purchases
        WHERE user_id = ${userId}
          AND contact_id IS NULL
          AND LOWER(supplier_invoice_number) = LOWER(${trimmed})
        LIMIT 1`)
  return result
}

export async function getPurchases(
  userId: string,
  filters?: PurchaseListFilters,
): Promise<PurchaseWithRelations[]> {
  const pool = await getPool()
  assertSafeIdentifier("purchases", "table name")

  const where: string[] = ["user_id = $1"]
  const params: unknown[] = [userId]
  if (filters?.dateFrom) {
    params.push(filters.dateFrom)
    where.push(`issue_date >= $${params.length}`)
  }
  if (filters?.dateTo) {
    params.push(filters.dateTo)
    where.push(`issue_date <= $${params.length}`)
  }
  if (filters?.status && filters.status.length > 0) {
    params.push(filters.status)
    where.push(`status = ANY($${params.length})`)
  }

  const docsResult = await pool.query(
    `SELECT * FROM purchases WHERE ${where.join(" AND ")} ORDER BY issue_date DESC LIMIT 1000`,
    params,
  )
  const purchases = docsResult.rows.map((r) => mapRow<Purchase>(r))
  if (purchases.length === 0) return []

  const purchaseIds = purchases.map((p) => p.id)
  const itemPlaceholders = purchaseIds.map((_, i) => `$${i + 1}`).join(", ")
  const itemsResult = await pool.query(
    `SELECT * FROM purchase_items WHERE purchase_id IN (${itemPlaceholders}) ORDER BY "position" ASC`,
    purchaseIds,
  )
  const allItems = itemsResult.rows.map((r) => mapRow<PurchaseItem>(r))

  const contactIds = [...new Set(purchases.map((p) => p.contactId).filter(Boolean))]
  const contactMap = new Map<string, Contact>()
  if (contactIds.length > 0) {
    const cPlaceholders = contactIds.map((_, i) => `$${i + 1}`).join(", ")
    const contactsResult = await pool.query(
      `SELECT * FROM contacts WHERE id IN (${cPlaceholders})`,
      contactIds,
    )
    for (const row of contactsResult.rows) {
      const c = mapRow<Contact>(row)
      contactMap.set(c.id, c)
    }
  }

  const itemsByPurchase = new Map<string, PurchaseItem[]>()
  for (const item of allItems) {
    const list = itemsByPurchase.get(item.purchaseId) ?? []
    list.push(item)
    itemsByPurchase.set(item.purchaseId, list)
  }

  return purchases.map((p) => ({
    ...p,
    contact: p.contactId ? contactMap.get(p.contactId) ?? null : null,
    items: itemsByPurchase.get(p.id) ?? [],
  }))
}

export const getPurchaseById = cache(
  async (id: string, userId: string): Promise<PurchaseWithRelations | null> => {
    const purchase = await queryOne<Purchase>(
      sql`SELECT * FROM purchases WHERE id = ${id} AND user_id = ${userId}`,
    )
    if (!purchase) return null

    const pool = await getPool()
    const itemsResult = await pool.query(
      `SELECT it.*, ${PRODUCT_JOIN_COLUMNS}
       FROM purchase_items it
       LEFT JOIN products pr ON pr.id = it.product_id
       WHERE it.purchase_id = $1
       ORDER BY it."position" ASC`,
      [id],
    )
    const items = itemsResult.rows.map((row) => {
      const item = mapRow<PurchaseItem & { product: Product | null }>(row)
      item.product = mapProductFromRow(row)
      return item
    })

    const contact = await fetchContact(purchase.contactId)
    return { ...purchase, contact, items }
  },
)

export async function createPurchase(
  userId: string,
  data: PurchaseData,
): Promise<PurchaseWithRelations> {
  return withTransaction(async (txClient) => {
    const { items, ...purchaseData } = data

    const pQuery = buildInsert("purchases", { ...purchaseData, userId })
    const pResult = await txClient.query(pQuery.text, pQuery.values)
    const purchase = firstRowOrThrow<Purchase>(pResult.rows, "insert purchases")

    const insertedItems = await insertItems(txClient, items, purchase.id)
    const contact = await fetchContactInTx(txClient, purchase.contactId)

    return { ...purchase, contact, items: insertedItems }
  })
}

export async function updatePurchase(id: string, userId: string, data: PurchaseData) {
  return withTransaction(async (txClient) => {
    const { items, ...purchaseData } = data

    await txClient.query(`DELETE FROM purchase_items WHERE purchase_id = $1`, [id])

    const updateQuery = buildUpdate("purchases", purchaseData, "id = $1 AND user_id = $2", [id, userId])
    const pResult = await txClient.query(updateQuery.text, updateQuery.values)
    const purchase = firstRowOrThrow<Purchase>(pResult.rows, "update purchases")

    const insertedItems = await insertItems(txClient, items, purchase.id)

    const result: [{ count: number }, Purchase & { items: PurchaseItem[] }] = [
      { count: items.length },
      { ...purchase, items: insertedItems },
    ]
    return result
  })
}

export async function updatePurchaseStatus(
  id: string,
  userId: string,
  status: string,
  paidAt?: Date | null,
) {
  const data: Record<string, unknown> = { status }
  if (status === "paid") {
    data["paidAt"] = paidAt ?? new Date()
  } else if (paidAt === undefined) {
    data["paidAt"] = null
  } else {
    data["paidAt"] = paidAt
  }
  return queryOne<Purchase>(
    buildUpdate("purchases", data, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function deletePurchase(id: string, userId: string) {
  await execute(sql`DELETE FROM purchase_items WHERE purchase_id = ${id}`)
  return queryOne<Purchase>(
    sql`DELETE FROM purchases WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
}

export async function setPurchasePdfFileId(
  id: string,
  userId: string,
  pdfFileId: string | null,
): Promise<Purchase | null> {
  return queryOne<Purchase>(
    sql`UPDATE purchases
        SET pdf_file_id = ${pdfFileId}, updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *`,
  )
}
