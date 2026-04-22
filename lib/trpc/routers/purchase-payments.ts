import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { purchasePaymentSchema } from "@/lib/db-types"
import {
  createPurchasePayment,
  deletePurchasePayment,
  listPaymentsForPurchase,
  listPaymentsForPurchaseWithTransaction,
  listPurchasePaymentsForTransaction,
  getAllocatedByPurchase,
  getPaymentCountByPurchase,
  getPurchaseAllocatedByTransaction,
  getPurchasePaymentById,
} from "@/models/purchase-payments"
import { getPurchaseById, updatePurchaseStatus, getPurchases } from "@/models/purchases"
import { getTransactions, getTransactionById } from "@/models/transactions"
import { attachFileToTransaction } from "@/models/files"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"

const paymentInputSchema = z.object({
  purchaseId: z.string(),
  transactionId: z.string(),
  amountCents: z.number().int().positive(),
  note: z.string().max(512).nullish(),
  source: z.enum(["manual", "ai"]).optional(),
})

const reconcileRowPurchaseSchema = z.object({
  id: z.string(),
  supplierInvoiceNumber: z.string(),
  contactName: z.string().nullable(),
  issueDate: z.date(),
  totalCents: z.number(),
  allocatedCents: z.number(),
  status: z.string(),
  notes: z.string().nullable(),
})

const reconcileRowTransactionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  merchant: z.string().nullable(),
  issuedAt: z.date().nullable(),
  totalCents: z.number(),
  type: z.string().nullable(),
  currencyCode: z.string().nullable(),
  allocatedCents: z.number(),
})

const reconcileOutputSchema = z.object({
  purchases: z.array(reconcileRowPurchaseSchema),
  transactions: z.array(reconcileRowTransactionSchema),
})

/**
 * When a purchase's allocations sum to >= total, flip status to "paid" and
 * derive paid_at from the latest linked transaction's issued_at.
 * Flip forward only — don't un-flip on delete (user may have set paid manually).
 */
export async function maybeAutoFlipPaidPurchase(purchaseId: string, userId: string): Promise<void> {
  const purchase = await getPurchaseById(purchaseId, userId)
  if (!purchase) return
  if (purchase.status === "paid" || purchase.status === "cancelled") return

  const { total } = calcInvoiceTotals(purchase.items, purchase.totalCents)
  const allocationMap = await getAllocatedByPurchase(userId)
  const allocated = allocationMap.get(purchaseId) ?? 0
  if (allocated >= total && total > 0) {
    const payments = await listPaymentsForPurchase(purchaseId, userId)
    let derivedDate: Date | null = null
    for (const pay of payments) {
      const tx = await getTransactionById(pay.transactionId, userId)
      if (tx?.issuedAt && (!derivedDate || tx.issuedAt > derivedDate)) {
        derivedDate = tx.issuedAt
      }
    }
    await updatePurchaseStatus(purchaseId, userId, "paid", derivedDate)
  }
}

export const purchasePaymentsRouter = router({
  listForPurchase: authedProcedure
    .input(z.object({ purchaseId: z.string() }))
    .output(
      z.array(
        purchasePaymentSchema.extend({
          transaction: z
            .object({
              id: z.string(),
              name: z.string().nullable(),
              merchant: z.string().nullable(),
              issuedAt: z.date().nullable(),
            })
            .nullable(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      return listPaymentsForPurchaseWithTransaction(input.purchaseId, ctx.user.id)
    }),

  /** Map of purchaseId → number of linked transactions, for the chain icon
   *  on the purchases list. */
  countsByPurchase: authedProcedure
    .input(z.object({}).optional())
    .output(z.record(z.string(), z.number().int()))
    .query(async ({ ctx }) => {
      const map = await getPaymentCountByPurchase(ctx.user.id)
      return Object.fromEntries(map)
    }),

  listForTransaction: authedProcedure
    .input(z.object({ transactionId: z.string() }))
    .output(z.array(purchasePaymentSchema))
    .query(async ({ ctx, input }) => {
      return listPurchasePaymentsForTransaction(input.transactionId, ctx.user.id)
    }),

  create: authedProcedure
    .input(paymentInputSchema)
    .output(purchasePaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const payment = await createPurchasePayment(ctx.user.id, {
        purchaseId: input.purchaseId,
        transactionId: input.transactionId,
        amountCents: input.amountCents,
        note: input.note ?? null,
        source: input.source ?? "manual",
      })
      if (!payment) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create payment",
        })
      }
      // If the purchase has a PDF attached, mirror it onto the paying
      // transaction so the receipt is visible from both surfaces.
      const purchase = await getPurchaseById(input.purchaseId, ctx.user.id)
      if (purchase?.pdfFileId) {
        await attachFileToTransaction(ctx.user.id, input.transactionId, purchase.pdfFileId)
      }
      await maybeAutoFlipPaidPurchase(input.purchaseId, ctx.user.id)
      return payment
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getPurchasePaymentById(input.id, ctx.user.id)
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" })
      }
      await deletePurchasePayment(input.id, ctx.user.id)
      return { ok: true }
    }),

  reconcileData: authedProcedure
    .input(z.object({ includeIncome: z.boolean().optional() }).optional())
    .output(reconcileOutputSchema)
    .query(async ({ ctx, input }) => {
      const includeIncome = input?.includeIncome === true
      const [allPurchases, txResult, allocByPurchase, allocByTx] = await Promise.all([
        getPurchases(ctx.user.id),
        getTransactions(ctx.user.id, {}),
        getAllocatedByPurchase(ctx.user.id),
        getPurchaseAllocatedByTransaction(ctx.user.id),
      ])

      const purchases = allPurchases
        .filter((p) => p.status !== "cancelled")
        .map((p) => {
          const { total } = calcInvoiceTotals(p.items, p.totalCents)
          const allocated = allocByPurchase.get(p.id) ?? 0
          return {
            id: p.id,
            supplierInvoiceNumber: p.supplierInvoiceNumber,
            contactName: p.contact?.name ?? null,
            issueDate: p.issueDate,
            totalCents: Math.round(total),
            allocatedCents: allocated,
            status: p.status,
            notes: p.notes,
          }
        })
        .filter((p) => p.allocatedCents < p.totalCents)

      const transactions = txResult.transactions
        .map((tx) => {
          const allocated = allocByTx.get(tx.id) ?? 0
          const absTotal = Math.abs(tx.total ?? 0)
          return {
            id: tx.id,
            name: tx.name,
            merchant: tx.merchant,
            issuedAt: tx.issuedAt,
            totalCents: absTotal,
            type: tx.type,
            currencyCode: tx.currencyCode,
            allocatedCents: allocated,
          }
        })
        .filter((tx) => {
          if (tx.allocatedCents >= tx.totalCents) return false
          if (includeIncome) return tx.type === "expense" || tx.type === "income"
          return tx.type === "expense"
        })

      return { purchases, transactions }
    }),
})
