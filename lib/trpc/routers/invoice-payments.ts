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
  getAllocatedByTransaction,
  getInvoicePaymentById,
} from "@/models/invoice-payments"
import { getInvoiceById, updateInvoiceStatus, getInvoices } from "@/models/invoices"
import { getTransactions } from "@/models/transactions"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { matchInvoicesToTransactions } from "@/ai/match-invoices"

const paymentInputSchema = z.object({
  invoiceId: z.string(),
  transactionId: z.string(),
  amountCents: z.number().int().positive(),
  note: z.string().max(512).nullish(),
  source: z.enum(["manual", "ai"]).optional(),
})

const reconcileRowInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  clientName: z.string().nullable(),
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
  invoices: z.array(reconcileRowInvoiceSchema),
  transactions: z.array(reconcileRowTransactionSchema),
})

const suggestedMatchSchema = z.object({
  invoiceId: z.string(),
  transactionId: z.string(),
  amountCents: z.number(),
  confidence: z.number(),
  reasoning: z.string(),
})

/**
 * After a payment is created or deleted, re-evaluate whether the invoice
 * is now "fully paid" and flip its status accordingly.
 *
 * Flip forward only: if allocations sum to >= total, mark paid.
 * Don't un-flip on delete — the user may have set paid manually.
 */
async function maybeAutoFlipPaid(invoiceId: string, userId: string): Promise<void> {
  const invoice = await getInvoiceById(invoiceId, userId)
  if (!invoice) return
  if (invoice.status === "paid" || invoice.status === "cancelled") return

  const { total } = calcInvoiceTotals(invoice.items)
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

  /**
   * Snapshot of everything the /reconcile page and the AI matcher need:
   * invoices with their computed totals and allocations, and transactions
   * with their allocations. Filters out fully-paid / fully-allocated rows.
   */
  reconcileData: authedProcedure
    .input(z.object({}).optional())
    .output(reconcileOutputSchema)
    .query(async ({ ctx }) => {
      const [allInvoices, txResult, allocByInvoice, allocByTx] = await Promise.all([
        getInvoices(ctx.user.id),
        getTransactions(ctx.user.id, {}),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByTransaction(ctx.user.id),
      ])

      const invoices = allInvoices
        .filter((inv) => inv.status !== "cancelled")
        .map((inv) => {
          const { total } = calcInvoiceTotals(inv.items)
          const allocated = allocByInvoice.get(inv.id) ?? 0
          return {
            id: inv.id,
            number: inv.number,
            clientName: inv.client?.name ?? null,
            issueDate: inv.issueDate,
            totalCents: Math.round(total),
            allocatedCents: allocated,
            status: inv.status,
            notes: inv.notes,
          }
        })
        .filter((inv) => inv.allocatedCents < inv.totalCents)

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
        .filter((tx) => tx.allocatedCents < tx.totalCents)

      return { invoices, transactions }
    }),

  aiMatch: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(suggestedMatchSchema))
    .mutation(async ({ ctx }) => {
      const [allInvoices, txResult, allocByInvoice, allocByTx] = await Promise.all([
        getInvoices(ctx.user.id),
        getTransactions(ctx.user.id, {}),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByTransaction(ctx.user.id),
      ])

      const invoices = allInvoices
        .filter((inv) => inv.status !== "cancelled")
        .map((inv) => {
          const { total } = calcInvoiceTotals(inv.items)
          return {
            id: inv.id,
            number: inv.number,
            clientName: inv.client?.name ?? null,
            issueDate: inv.issueDate.toISOString().slice(0, 10),
            totalCents: Math.round(total),
            allocatedCents: allocByInvoice.get(inv.id) ?? 0,
            notes: inv.notes,
          }
        })
        .filter((inv) => inv.allocatedCents < inv.totalCents)

      const transactions = txResult.transactions
        .map((tx) => ({
          id: tx.id,
          name: tx.name,
          merchant: tx.merchant,
          issuedAt: tx.issuedAt ? tx.issuedAt.toISOString().slice(0, 10) : null,
          totalCents: Math.abs(tx.total ?? 0),
          type: tx.type,
          currencyCode: tx.currencyCode,
          allocatedCents: allocByTx.get(tx.id) ?? 0,
        }))
        .filter((tx) => tx.allocatedCents < tx.totalCents)

      if (invoices.length === 0 || transactions.length === 0) return []

      const suggestions = await matchInvoicesToTransactions(invoices, transactions, ctx.user.id)
      return suggestions
    }),
})
