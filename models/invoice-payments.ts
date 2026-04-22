import { sql, queryMany, queryOne, buildInsert } from "@/lib/sql"
import type { InvoicePayment } from "@/lib/db-types"

export type InvoicePaymentData = {
  invoiceId: string
  transactionId: string
  amountCents: number
  note?: string | null
  source?: string
}

export async function createInvoicePayment(
  userId: string,
  data: InvoicePaymentData,
): Promise<InvoicePayment | null> {
  return queryOne<InvoicePayment>(
    buildInsert("invoice_payments", { ...data, userId }),
  )
}

export async function deleteInvoicePayment(
  id: string,
  userId: string,
): Promise<InvoicePayment | null> {
  return queryOne<InvoicePayment>(
    sql`DELETE FROM invoice_payments WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
}

export async function listPaymentsForInvoice(
  invoiceId: string,
  userId: string,
): Promise<InvoicePayment[]> {
  return queryMany<InvoicePayment>(
    sql`SELECT * FROM invoice_payments
        WHERE invoice_id = ${invoiceId} AND user_id = ${userId}
        ORDER BY created_at ASC`,
  )
}

export async function listPaymentsForTransaction(
  transactionId: string,
  userId: string,
): Promise<InvoicePayment[]> {
  return queryMany<InvoicePayment>(
    sql`SELECT * FROM invoice_payments
        WHERE transaction_id = ${transactionId} AND user_id = ${userId}
        ORDER BY created_at ASC`,
  )
}

export type InvoicePaymentWithTransaction = InvoicePayment & {
  transaction: {
    id: string
    name: string | null
    merchant: string | null
    issuedAt: Date | null
  } | null
}

/**
 * Same as listPaymentsForInvoice, plus the linked transaction's display
 * fields via JOIN. `transaction` is null if the linked row was deleted.
 */
export async function listPaymentsForInvoiceWithTransaction(
  invoiceId: string,
  userId: string,
): Promise<InvoicePaymentWithTransaction[]> {
  const rows = await queryMany<
    InvoicePayment & {
      txId: string | null
      txName: string | null
      txMerchant: string | null
      txIssuedAt: Date | null
    }
  >(
    sql`SELECT ip.*, t.id AS tx_id, t.name AS tx_name,
               t.merchant AS tx_merchant, t.issued_at AS tx_issued_at
        FROM invoice_payments ip
        LEFT JOIN transactions t ON t.id = ip.transaction_id
        WHERE ip.invoice_id = ${invoiceId} AND ip.user_id = ${userId}
        ORDER BY ip.created_at ASC`,
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

/**
 * Sum of allocations per invoice for a user, as { invoiceId → cents } map.
 * Used to compute outstanding balance and to detect fully-paid invoices.
 */
export async function getAllocatedByInvoice(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ invoiceId: string; totalCents: string | number }>(
    sql`SELECT invoice_id, SUM(amount_cents)::bigint AS total_cents
        FROM invoice_payments
        WHERE user_id = ${userId}
        GROUP BY invoice_id`,
  )
  return new Map(rows.map((r) => [r.invoiceId, Number(r.totalCents)]))
}

/**
 * Number of linked transactions per invoice. Drives the "chain" icon on the
 * invoices list — a count rather than a boolean so the UI can show "3"
 * when a single invoice was paid off across multiple transactions.
 */
export async function getPaymentCountByInvoice(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ invoiceId: string; count: string | number }>(
    sql`SELECT invoice_id, COUNT(*)::int AS count
        FROM invoice_payments
        WHERE user_id = ${userId}
        GROUP BY invoice_id`,
  )
  return new Map(rows.map((r) => [r.invoiceId, Number(r.count)]))
}

/**
 * Sum of allocations per transaction for a user. Used to surface
 * "partially allocated" / "fully allocated" state on the reconcile page.
 */
export async function getAllocatedByTransaction(userId: string): Promise<Map<string, number>> {
  const rows = await queryMany<{ transactionId: string; totalCents: string | number }>(
    sql`SELECT transaction_id, SUM(amount_cents)::bigint AS total_cents
        FROM invoice_payments
        WHERE user_id = ${userId}
        GROUP BY transaction_id`,
  )
  return new Map(rows.map((r) => [r.transactionId, Number(r.totalCents)]))
}

export async function getInvoicePaymentById(
  id: string,
  userId: string,
): Promise<InvoicePayment | null> {
  return queryOne<InvoicePayment>(
    sql`SELECT * FROM invoice_payments WHERE id = ${id} AND user_id = ${userId}`,
  )
}

/** Overwrite amount_cents on one payment row. Returns the updated row, or
 *  null if no row matched (wrong id or wrong user). */
export async function updateInvoicePaymentAmount(
  id: string,
  userId: string,
  amountCents: number,
): Promise<InvoicePayment | null> {
  return queryOne<InvoicePayment>(
    sql`UPDATE invoice_payments
        SET amount_cents = ${amountCents}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *`,
  )
}

/** Same, for every-payment list queries that need the joined invoice info. */
export async function listAllInvoicePayments(userId: string): Promise<InvoicePayment[]> {
  return queryMany<InvoicePayment>(
    sql`SELECT * FROM invoice_payments
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1000`,
  )
}
