import { getPool } from "@/lib/pg"
import {
  sql,
  queryMany,
  queryOne,
  buildInsert,
  buildUpdate,
  execute,
  mapRow,
  withTransaction,
  mapProductFromRow,
  assertSafeIdentifier,
  camelToSnake,
} from "@/lib/sql"
import type {
  Invoice,
  InvoiceItem,
  Quote,
  QuoteItem,
  Client,
  Product,
} from "@/lib/db-types"
import type { PoolClient } from "pg"
import { cache } from "react"

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type InvoiceItemData = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

export type InvoiceData = {
  clientId?: string | null
  quoteId?: string | null
  number: string
  status?: string
  issueDate: Date
  dueDate?: Date | null
  notes?: string | null
  irpfRate?: number
  items: InvoiceItemData[]
}

export type QuoteItemData = {
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
  position: number
}

export type QuoteData = {
  clientId?: string | null
  number: string
  status?: string
  issueDate: Date
  expiryDate?: Date | null
  notes?: string | null
  items: QuoteItemData[]
}

// ---------------------------------------------------------------------------
// Row mappers for JOINed results
// ---------------------------------------------------------------------------

export type InvoiceWithRelations = Invoice & {
  client: Client | null
  items: (InvoiceItem & { product?: Product | null })[]
  quote?: Quote | null
}

export type QuoteWithRelations = Quote & {
  client: Client | null
  items: (QuoteItem & { product?: Product | null })[]
  invoice?: Invoice | null
}

// ---------------------------------------------------------------------------
// Generic document helpers (shared by invoices and quotes)
// ---------------------------------------------------------------------------

type DocumentConfig = {
  table: string
  itemsTable: string
  /** FK column on the items table pointing back to the parent doc */
  itemFk: string
}

const INVOICE_CONFIG: DocumentConfig = {
  table: "invoices",
  itemsTable: "invoice_items",
  itemFk: "invoiceId",
}

const QUOTE_CONFIG: DocumentConfig = {
  table: "quotes",
  itemsTable: "quote_items",
  itemFk: "quoteId",
}

/** Fetch a list of documents with their items and clients. */
async function fetchDocumentsWithItems<TDoc extends { id: string; clientId: string | null }, TItem>(
  userId: string,
  config: DocumentConfig,
  itemParentKey: keyof TItem & string,
): Promise<(TDoc & { client: Client | null; items: TItem[] })[]> {
  const pool = await getPool()
  // Validate identifiers — these come from hardcoded configs but guard anyway
  assertSafeIdentifier(config.table, "table name")
  assertSafeIdentifier(config.itemsTable, "items table name")
  const fkColumn = camelToSnake(config.itemFk)
  assertSafeIdentifier(fkColumn, "FK column name")

  const docsResult = await pool.query(
    `SELECT * FROM ${config.table} WHERE user_id = $1 ORDER BY issue_date DESC LIMIT 1000`,
    [userId],
  )
  const docs = docsResult.rows.map((r) => mapRow<TDoc>(r))
  if (docs.length === 0) return []

  const docIds = docs.map((d) => d.id)

  // Fetch all items
  const itemPlaceholders = docIds.map((_, i) => `$${i + 1}`).join(", ")
  const itemsResult = await pool.query(
    `SELECT * FROM ${config.itemsTable} WHERE ${fkColumn} IN (${itemPlaceholders})`,
    docIds,
  )
  const allItems = itemsResult.rows.map((r) => mapRow<TItem>(r))

  // Fetch clients
  const clientIds = [...new Set(docs.map((d) => d.clientId).filter(Boolean))]
  let clientMap = new Map<string, Client>()
  if (clientIds.length > 0) {
    const cPlaceholders = clientIds.map((_, i) => `$${i + 1}`).join(", ")
    const clientsResult = await pool.query(
      `SELECT * FROM clients WHERE id IN (${cPlaceholders})`,
      clientIds,
    )
    clientMap = new Map(clientsResult.rows.map((r) => {
      const c = mapRow<Client>(r)
      return [c.id, c]
    }))
  }

  // Group items by document
  const itemsByDoc = new Map<string, TItem[]>()
  for (const item of allItems) {
    const parentId = (item as Record<string, unknown>)[itemParentKey] as string
    const list = itemsByDoc.get(parentId) ?? []
    list.push(item)
    itemsByDoc.set(parentId, list)
  }

  return docs.map((doc) => ({
    ...doc,
    client: doc.clientId ? clientMap.get(doc.clientId) ?? null : null,
    items: itemsByDoc.get(doc.id) ?? [],
  }))
}

const PRODUCT_JOIN_COLUMNS = `
  pr.id AS prod_id, pr.user_id AS prod_user_id, pr.name AS prod_name,
  pr.description AS prod_description, pr.price AS prod_price,
  pr.currency_code AS prod_currency_code, pr.vat_rate AS prod_vat_rate,
  pr.unit AS prod_unit, pr.created_at AS prod_created_at, pr.updated_at AS prod_updated_at`

/** Fetch items with product JOINs for a single document. */
async function fetchItemsWithProducts<TItem>(
  docId: string,
  config: DocumentConfig,
): Promise<(TItem & { product: Product | null })[]> {
  const pool = await getPool()
  const fkColumn = camelToSnake(config.itemFk)
  // Table/column names already validated in config usage, but guard here too
  assertSafeIdentifier(config.itemsTable, "items table name")
  assertSafeIdentifier(fkColumn, "FK column name")
  const itemsResult = await pool.query(
    `SELECT it.*, ${PRODUCT_JOIN_COLUMNS}
     FROM ${config.itemsTable} it
     LEFT JOIN products pr ON pr.id = it.product_id
     WHERE it.${fkColumn} = $1
     ORDER BY it.position ASC`,
    [docId],
  )
  return itemsResult.rows.map((row) => {
    const item = mapRow<TItem & { product: Product | null }>(row)
    item.product = mapProductFromRow(row)
    return item
  })
}

/** Fetch a Client by id, or null. */
async function fetchClient(clientId: string | null | undefined): Promise<Client | null> {
  if (!clientId) return null
  return queryOne<Client>(sql`SELECT * FROM clients WHERE id = ${clientId}`)
}

/** Insert items within a transaction. */
async function insertItems<TItem>(
  txClient: PoolClient,
  items: Record<string, unknown>[],
  config: DocumentConfig,
  docId: string,
): Promise<TItem[]> {
  const inserted: TItem[] = []
  for (const item of items) {
    const itemInsert = buildInsert(config.itemsTable, {
      ...item,
      [config.itemFk]: docId,
    })
    const result = await txClient.query(itemInsert.text, itemInsert.values)
    inserted.push(mapRow<TItem>(result.rows[0]))
  }
  return inserted
}

/** Fetch client within a transaction. */
async function fetchClientInTx(
  txClient: PoolClient,
  clientId: string | null | undefined,
): Promise<Client | null> {
  if (!clientId) return null
  const result = await txClient.query(`SELECT * FROM clients WHERE id = $1`, [clientId])
  return result.rows.length > 0 ? mapRow<Client>(result.rows[0]) : null
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const getInvoices = cache(async (userId: string): Promise<InvoiceWithRelations[]> => {
  return fetchDocumentsWithItems<Invoice, InvoiceItem>(userId, INVOICE_CONFIG, "invoiceId")
})

export const getInvoiceById = cache(
  async (id: string, userId: string): Promise<InvoiceWithRelations | null> => {
    const invoice = await queryOne<Invoice>(
      sql`SELECT * FROM invoices WHERE id = ${id} AND user_id = ${userId}`,
    )
    if (!invoice) return null

    const [items, client, quote] = await Promise.all([
      fetchItemsWithProducts<InvoiceItem>(id, INVOICE_CONFIG),
      fetchClient(invoice.clientId),
      invoice.quoteId
        ? queryOne<Quote>(sql`SELECT * FROM quotes WHERE id = ${invoice.quoteId}`)
        : null,
    ])

    return { ...invoice, client, items, quote }
  },
)

export async function createInvoice(
  userId: string,
  data: InvoiceData,
): Promise<InvoiceWithRelations> {
  return withTransaction(async (txClient) => {
    const { items, ...invoiceData } = data

    const invQuery = buildInsert("invoices", { ...invoiceData, userId })
    const invResult = await txClient.query(invQuery.text, invQuery.values)
    const invoice = mapRow<Invoice>(invResult.rows[0])

    const insertedItems = await insertItems<InvoiceItem>(txClient, items, INVOICE_CONFIG, invoice.id)
    const client = await fetchClientInTx(txClient, invoice.clientId)

    return { ...invoice, client, items: insertedItems }
  })
}

export async function updateInvoice(id: string, userId: string, data: InvoiceData) {
  return withTransaction(async (txClient) => {
    const { items, ...invoiceData } = data

    await txClient.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id])

    const updateQuery = buildUpdate("invoices", invoiceData, "id = $1 AND user_id = $2", [id, userId])
    const invResult = await txClient.query(updateQuery.text, updateQuery.values)
    const invoice = mapRow<Invoice>(invResult.rows[0])

    const insertedItems = await insertItems<InvoiceItem>(txClient, items, INVOICE_CONFIG, invoice.id)

    const result: [{ count: number }, Invoice & { items: InvoiceItem[] }] = [
      { count: items.length },
      { ...invoice, items: insertedItems },
    ]
    return result
  })
}

export async function updateInvoiceStatus(id: string, userId: string, status: string) {
  const data: Record<string, unknown> = { status }
  if (status === "paid") data.paidAt = new Date()
  if (status !== "paid") data.paidAt = null

  return queryOne<Invoice>(
    buildUpdate("invoices", data, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function deleteInvoice(id: string, userId: string) {
  await execute(sql`DELETE FROM invoice_items WHERE invoice_id = ${id}`)
  return queryOne<Invoice>(
    sql`DELETE FROM invoices WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export const getQuotes = cache(async (userId: string): Promise<QuoteWithRelations[]> => {
  return fetchDocumentsWithItems<Quote, QuoteItem>(userId, QUOTE_CONFIG, "quoteId")
})

export const getQuoteById = cache(
  async (id: string, userId: string): Promise<QuoteWithRelations | null> => {
    const quote = await queryOne<Quote>(
      sql`SELECT * FROM quotes WHERE id = ${id} AND user_id = ${userId}`,
    )
    if (!quote) return null

    const [items, client, invoice] = await Promise.all([
      fetchItemsWithProducts<QuoteItem>(id, QUOTE_CONFIG),
      fetchClient(quote.clientId),
      queryOne<Invoice>(sql`SELECT * FROM invoices WHERE quote_id = ${id}`),
    ])

    return { ...quote, client, items, invoice }
  },
)

export async function createQuote(
  userId: string,
  data: QuoteData,
): Promise<QuoteWithRelations> {
  return withTransaction(async (txClient) => {
    const { items, ...quoteData } = data

    const qQuery = buildInsert("quotes", { ...quoteData, userId })
    const qResult = await txClient.query(qQuery.text, qQuery.values)
    const quote = mapRow<Quote>(qResult.rows[0])

    const insertedItems = await insertItems<QuoteItem>(txClient, items, QUOTE_CONFIG, quote.id)
    const client = await fetchClientInTx(txClient, quote.clientId)

    return { ...quote, client, items: insertedItems }
  })
}

export async function updateQuote(id: string, userId: string, data: QuoteData) {
  return withTransaction(async (txClient) => {
    const { items, ...quoteData } = data

    await txClient.query(`DELETE FROM quote_items WHERE quote_id = $1`, [id])

    const updateQuery = buildUpdate("quotes", quoteData, "id = $1 AND user_id = $2", [id, userId])
    const qResult = await txClient.query(updateQuery.text, updateQuery.values)
    const quote = mapRow<Quote>(qResult.rows[0])

    const insertedItems = await insertItems<QuoteItem>(txClient, items, QUOTE_CONFIG, quote.id)

    const result: [{ count: number }, Quote & { items: QuoteItem[] }] = [
      { count: items.length },
      { ...quote, items: insertedItems },
    ]
    return result
  })
}

export async function deleteQuote(id: string, userId: string) {
  await execute(sql`DELETE FROM quote_items WHERE quote_id = ${id}`)
  return queryOne<Quote>(
    sql`DELETE FROM quotes WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
}

// ---------------------------------------------------------------------------
// Quote → Invoice conversion
// ---------------------------------------------------------------------------

export async function convertQuoteToInvoice(
  quoteId: string,
  userId: string,
  invoiceNumber: string,
): Promise<InvoiceWithRelations> {
  return withTransaction(async (txClient) => {
    const qResult = await txClient.query(
      `SELECT * FROM quotes WHERE id = $1 AND user_id = $2`,
      [quoteId, userId],
    )
    if (qResult.rows.length === 0) throw new Error("Quote not found")
    const quote = mapRow<Quote>(qResult.rows[0])

    const qItemsResult = await txClient.query(
      `SELECT * FROM quote_items WHERE quote_id = $1`,
      [quoteId],
    )
    const quoteItems = qItemsResult.rows.map((r) => mapRow<QuoteItem>(r))

    const invoiceInsert = buildInsert("invoices", {
      userId,
      clientId: quote.clientId,
      quoteId: quote.id,
      number: invoiceNumber,
      status: "draft",
      issueDate: new Date(),
    })
    const invResult = await txClient.query(invoiceInsert.text, invoiceInsert.values)
    const invoice = mapRow<Invoice>(invResult.rows[0])

    const itemData = quoteItems.map((qi) => ({
      productId: qi.productId,
      description: qi.description,
      quantity: qi.quantity,
      unitPrice: qi.unitPrice,
      vatRate: qi.vatRate,
      position: qi.position,
    }))
    const insertedItems = await insertItems<InvoiceItem>(txClient, itemData, INVOICE_CONFIG, invoice.id)

    await txClient.query(`UPDATE quotes SET status = 'converted' WHERE id = $1`, [quoteId])

    const client = await fetchClientInTx(txClient, invoice.clientId)

    return { ...invoice, client, items: insertedItems }
  })
}
