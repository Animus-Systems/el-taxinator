import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { invoicePaymentSchema } from "@/lib/db-types"
import {
  createInvoicePayment,
  deleteInvoicePayment,
  listPaymentsForInvoice,
  listPaymentsForTransaction,
  getAllocatedByInvoice,
  getPaymentCountByInvoice,
  getInvoicePaymentById,
} from "@/models/invoice-payments"
import { getInvoiceById, updateInvoiceStatus } from "@/models/invoices"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"

const paymentInputSchema = z.object({
  invoiceId: z.string(),
  transactionId: z.string(),
  amountCents: z.number().int().positive(),
  note: z.string().max(512).nullish(),
  source: z.enum(["manual", "ai"]).optional(),
})

/**
 * After a payment is created or deleted, re-evaluate whether the invoice
 * is now "fully paid" and flip its status accordingly.
 *
 * Flip forward only: if allocations sum to >= total, mark paid.
 * Don't un-flip on delete — the user may have set paid manually.
 */
export async function maybeAutoFlipPaid(invoiceId: string, userId: string): Promise<void> {
  const invoice = await getInvoiceById(invoiceId, userId)
  if (!invoice) return
  if (invoice.status === "paid" || invoice.status === "cancelled") return

  const { total } = calcInvoiceTotals(invoice.items, invoice.totalCents)
  const allocationMap = await getAllocatedByInvoice(userId)
  const allocated = allocationMap.get(invoiceId) ?? 0
  if (allocated >= total && total > 0) {
    await updateInvoiceStatus(invoiceId, userId, "paid")
  }
}

export const invoicePaymentsRouter = router({
  listForInvoice: authedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .output(z.array(invoicePaymentSchema))
    .query(async ({ ctx, input }) => {
      return listPaymentsForInvoice(input.invoiceId, ctx.user.id)
    }),

  /** Map of invoiceId → number of linked transactions, for the chain icon
   *  on the invoices list. Single GROUP BY, cheap for any realistic
   *  ledger size. */
  countsByInvoice: authedProcedure
    .input(z.object({}).optional())
    .output(z.record(z.string(), z.number().int()))
    .query(async ({ ctx }) => {
      const map = await getPaymentCountByInvoice(ctx.user.id)
      return Object.fromEntries(map)
    }),

  listForTransaction: authedProcedure
    .input(z.object({ transactionId: z.string() }))
    .output(z.array(invoicePaymentSchema))
    .query(async ({ ctx, input }) => {
      return listPaymentsForTransaction(input.transactionId, ctx.user.id)
    }),

  create: authedProcedure
    .input(paymentInputSchema)
    .output(invoicePaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const payment = await createInvoicePayment(ctx.user.id, {
        invoiceId: input.invoiceId,
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
      await maybeAutoFlipPaid(input.invoiceId, ctx.user.id)
      return payment
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getInvoicePaymentById(input.id, ctx.user.id)
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" })
      }
      await deleteInvoicePayment(input.id, ctx.user.id)
      return { ok: true }
    }),
})
