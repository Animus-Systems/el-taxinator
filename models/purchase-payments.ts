import { sql, queryMany, queryOne, buildInsert } from "@/lib/sql"
import type { PurchasePayment } from "@/lib/db-types"

export type PurchasePaymentData = {
  purchaseId: string
  transactionId: string
  amountCents: number
  note?: string | null
  source?: string
}

export async function createPurchasePayment(
  userId: string,
  data: PurchasePaymentData,
): Promise<PurchasePayment | null> {
  return queryOne<PurchasePayment>(
    buildInsert("purchase_payments", { ...data, userId }),
  )
}

export async function deletePurchasePayment(
  id: string,
  userId: string,
): Promise<PurchasePayment | null> {
  return queryOne<PurchasePayment>(
    sql`DELETE FROM purchase_payments WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
}

export async function listPaymentsForPurchase(
  purchaseId: string,
  userId: string,
): Promise<PurchasePayment[]> {
  return queryMany<PurchasePayment>(
    sql`SELECT * FROM purchase_payments
        WHERE purchase_id = ${purchaseId} AND user_id = ${userId}
        ORDER BY created_at ASC`,
  )
}

export async function listPurchasePaymentsForTransaction(
  transactionId: string,
  userId: string,
): Promise<PurchasePayment[]> {
  return queryMany<PurchasePayment>(
    sql`SELECT * FROM purchase_payments
        WHERE transaction_id = ${transactionId} AND user_id = ${userId}
        ORDER BY created_at ASC`,
  )
}

export async function getAllocatedByPurchase(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ purchaseId: string; totalCents: string | number }>(
    sql`SELECT purchase_id, SUM(amount_cents)::bigint AS total_cents
        FROM purchase_payments
        WHERE user_id = ${userId}
        GROUP BY purchase_id`,
  )
  return new Map(rows.map((r) => [r.purchaseId, Number(r.totalCents)]))
}

export async function getPurchaseAllocatedByTransaction(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ transactionId: string; totalCents: string | number }>(
    sql`SELECT transaction_id, SUM(amount_cents)::bigint AS total_cents
        FROM purchase_payments
        WHERE user_id = ${userId}
        GROUP BY transaction_id`,
  )
  return new Map(rows.map((r) => [r.transactionId, Number(r.totalCents)]))
}

export async function getPurchasePaymentById(
  id: string,
  userId: string,
): Promise<PurchasePayment | null> {
  return queryOne<PurchasePayment>(
    sql`SELECT * FROM purchase_payments WHERE id = ${id} AND user_id = ${userId}`,
  )
}

export async function updatePurchasePaymentAmount(
  id: string,
  userId: string,
  amountCents: number,
): Promise<PurchasePayment | null> {
  return queryOne<PurchasePayment>(
    sql`UPDATE purchase_payments
        SET amount_cents = ${amountCents}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *`,
  )
}

export async function listAllPurchasePayments(userId: string): Promise<PurchasePayment[]> {
  return queryMany<PurchasePayment>(
    sql`SELECT * FROM purchase_payments
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1000`,
  )
}
