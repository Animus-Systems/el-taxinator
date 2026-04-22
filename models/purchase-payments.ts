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

export type PurchasePaymentWithTransaction = PurchasePayment & {
  transaction: {
    id: string
    name: string | null
    merchant: string | null
    issuedAt: Date | null
  } | null
}

/**
 * Same rows as listPaymentsForPurchase but JOINed with the transactions
 * table so the UI can show which transaction is linked (name/merchant/date)
 * without an N+1 fetch. `transaction` is null when the linked transaction
 * has been deleted.
 */
export async function listPaymentsForPurchaseWithTransaction(
  purchaseId: string,
  userId: string,
): Promise<PurchasePaymentWithTransaction[]> {
  const rows = await queryMany<
    PurchasePayment & {
      txId: string | null
      txName: string | null
      txMerchant: string | null
      txIssuedAt: Date | null
    }
  >(
    sql`SELECT pp.*, t.id AS tx_id, t.name AS tx_name,
               t.merchant AS tx_merchant, t.issued_at AS tx_issued_at
        FROM purchase_payments pp
        LEFT JOIN transactions t ON t.id = pp.transaction_id
        WHERE pp.purchase_id = ${purchaseId} AND pp.user_id = ${userId}
        ORDER BY pp.created_at ASC`,
  )
  return rows.map((r) => {
    const { txId, txName, txMerchant, txIssuedAt, ...payment } = r
    return {
      ...payment,
      transaction: txId
        ? { id: txId, name: txName, merchant: txMerchant, issuedAt: txIssuedAt }
        : null,
    }
  })
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

/**
 * Number of linked transactions per purchase. Drives the "chain" icon on
 * the purchases list. Cash purchases paid out of a lump-sum cash deposit
 * naturally have >1 and should still surface as linked.
 */
export async function getPaymentCountByPurchase(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ purchaseId: string; count: string | number }>(
    sql`SELECT purchase_id, COUNT(*)::int AS count
        FROM purchase_payments
        WHERE user_id = ${userId}
        GROUP BY purchase_id`,
  )
  return new Map(rows.map((r) => [r.purchaseId, Number(r.count)]))
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
