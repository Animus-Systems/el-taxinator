/**
 * Unified reconciliation router.
 *
 * Exposes a single view of everything waiting to be matched — invoices that
 * haven't been paid in full AND purchases that haven't been paid in full — and
 * an AI matcher that proposes pairings across both sides. The actual write
 * mutations still live on invoice-payments / purchase-payments so this router
 * is a read + AI layer; `allocate` dispatches to whichever side the document
 * belongs to.
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { getTransactions } from "@/models/transactions"
import {
  createInvoicePayment,
  deleteInvoicePayment,
  getAllocatedByInvoice,
  getAllocatedByTransaction,
  getInvoicePaymentById,
  listAllInvoicePayments,
  listPaymentsForTransaction,
  updateInvoicePaymentAmount,
} from "@/models/invoice-payments"
import {
  createPurchasePayment,
  deletePurchasePayment,
  getAllocatedByPurchase,
  getPurchaseAllocatedByTransaction,
  getPurchasePaymentById,
  listAllPurchasePayments,
  listPurchasePaymentsForTransaction,
  updatePurchasePaymentAmount,
} from "@/models/purchase-payments"
import { attachFileToTransaction } from "@/models/files"
import { getInvoices, updateInvoiceStatus, updateInvoiceTotalCents } from "@/models/invoices"
import {
  getPurchaseById,
  getPurchases,
  updatePurchaseStatus,
  updatePurchaseTotalCents,
} from "@/models/purchases"
import { getTransactionById } from "@/models/transactions"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { matchDocumentsToTransactions } from "@/ai/match-documents"
import { maybeAutoFlipPaid } from "./invoice-payments"
import { maybeAutoFlipPaidPurchase } from "./purchase-payments"

const docKindSchema = z.enum(["invoice", "purchase"])

const reconcileDocumentSchema = z.object({
  id: z.string(),
  kind: docKindSchema,
  number: z.string(),
  contactName: z.string().nullable(),
  issueDate: z.date(),
  totalCents: z.number(),
  allocatedCents: z.number(),
  status: z.string(),
  currencyCode: z.string(),
  notes: z.string().nullable(),
})

const reconcileTransactionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  merchant: z.string().nullable(),
  /** Bank narrative — often carries a reference number / counterparty detail
   *  that makes it obvious which document a transaction relates to. */
  description: z.string().nullable(),
  issuedAt: z.date().nullable(),
  totalCents: z.number(),
  /** 'income' | 'expense' | null — null transactions shouldn't appear here. */
  type: z.string().nullable(),
  /** 'business' | 'business_non_deductible' | 'personal_taxable' | … */
  status: z.string().nullable(),
  currencyCode: z.string().nullable(),
  categoryCode: z.string().nullable(),
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
  note: z.string().nullable(),
  allocatedCents: z.number(),
})

const suggestedMatchSchema = z.object({
  documentId: z.string(),
  documentKind: docKindSchema,
  transactionId: z.string(),
  amountCents: z.number(),
  confidence: z.number(),
  reasoning: z.string(),
})

/** Shape returned by `links` — one row per existing doc↔tx allocation, with
 *  enough info to render both sides + the amount + an unlink button without
 *  extra round-trips. Different from `allocationsForTransaction` because it
 *  also carries the transaction preview, not just the document. */
const linkedPairSchema = z.object({
  paymentId: z.string(),
  documentKind: docKindSchema,
  documentId: z.string(),
  documentNumber: z.string(),
  documentContactName: z.string().nullable(),
  documentIssueDate: z.date(),
  documentTotalCents: z.number(),
  documentCurrencyCode: z.string(),
  transactionId: z.string(),
  transactionName: z.string().nullable(),
  transactionMerchant: z.string().nullable(),
  transactionIssuedAt: z.date().nullable(),
  transactionTotalCents: z.number(),
  transactionType: z.string().nullable(),
  transactionCurrencyCode: z.string().nullable(),
  amountCents: z.number(),
  source: z.string(),
  createdAt: z.date(),
})

/** Shape returned by `allocationsForTransaction` — a single row per payment
 *  regardless of whether it's an invoice or purchase payment. */
const transactionAllocationSchema = z.object({
  /** payment row id (invoice_payments.id or purchase_payments.id). */
  paymentId: z.string(),
  documentKind: docKindSchema,
  documentId: z.string(),
  documentNumber: z.string(),
  contactName: z.string().nullable(),
  issueDate: z.date(),
  documentTotalCents: z.number(),
  documentCurrencyCode: z.string(),
  amountCents: z.number(),
  source: z.string(),
  note: z.string().nullable(),
  createdAt: z.date(),
})

export const reconcileRouter = router({
  /** Unified read: every unpaid invoice + purchase, every unallocated tx. */
  data: authedProcedure
    .input(z.object({}).optional())
    .output(
      z.object({
        documents: z.array(reconcileDocumentSchema),
        transactions: z.array(reconcileTransactionSchema),
      }),
    )
    .query(async ({ ctx }) => {
      const [
        allInvoices,
        allPurchases,
        txResult,
        allocByInvoice,
        allocByPurchase,
        allocByTxInvoice,
        allocByTxPurchase,
      ] = await Promise.all([
        getInvoices(ctx.user.id),
        getPurchases(ctx.user.id),
        getTransactions(ctx.user.id, {}),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByPurchase(ctx.user.id),
        getAllocatedByTransaction(ctx.user.id),
        getPurchaseAllocatedByTransaction(ctx.user.id),
      ])

      const invoiceDocs = allInvoices
        .filter((inv) => inv.status !== "cancelled")
        .map((inv) => {
          const { total } = calcInvoiceTotals(inv.items, inv.totalCents)
          const allocated = allocByInvoice.get(inv.id) ?? 0
          return {
            id: inv.id,
            kind: "invoice" as const,
            number: inv.number,
            contactName: inv.client?.name ?? null,
            issueDate: inv.issueDate,
            totalCents: Math.round(total),
            allocatedCents: allocated,
            status: inv.status,
            currencyCode: inv.currencyCode || "EUR",
            notes: inv.notes,
          }
        })
        .filter((d) => d.allocatedCents < d.totalCents)

      const purchaseDocs = allPurchases
        .filter((p) => p.status !== "cancelled")
        .map((p) => {
          const { total } = calcInvoiceTotals(p.items, p.totalCents)
          const allocated = allocByPurchase.get(p.id) ?? 0
          return {
            id: p.id,
            kind: "purchase" as const,
            number: p.supplierInvoiceNumber,
            contactName: p.contact?.name ?? null,
            issueDate: p.issueDate,
            totalCents: Math.round(total),
            allocatedCents: allocated,
            status: p.status,
            currencyCode: p.currencyCode || "EUR",
            notes: p.notes,
          }
        })
        .filter((d) => d.allocatedCents < d.totalCents)

      const documents = [...invoiceDocs, ...purchaseDocs].sort(
        (a, b) => b.issueDate.getTime() - a.issueDate.getTime(),
      )

      const transactions = txResult.transactions
        .map((tx) => {
          const fromInvoices = allocByTxInvoice.get(tx.id) ?? 0
          const fromPurchases = allocByTxPurchase.get(tx.id) ?? 0
          // `accountName` is denormalised onto the row by mapTransactionRow
          // via the LEFT JOIN in getTransactions, so no extra query needed.
          const accountName = (tx as { accountName?: string | null }).accountName ?? null
          return {
            id: tx.id,
            name: tx.name,
            merchant: tx.merchant,
            description: tx.description,
            issuedAt: tx.issuedAt,
            totalCents: Math.abs(tx.total ?? 0),
            type: tx.type,
            status: tx.status,
            currencyCode: tx.currencyCode,
            categoryCode: tx.categoryCode,
            accountId: tx.accountId,
            accountName,
            note: tx.note,
            allocatedCents: fromInvoices + fromPurchases,
          }
        })
        .filter((tx) => tx.allocatedCents < tx.totalCents)
        .filter((tx) => tx.type === "income" || tx.type === "expense")

      return { documents, transactions }
    }),

  /** Ask the AI to suggest matches. Runs over the same data as `data()` above
   * plus internal direction/currency filters applied in the matcher. */
  aiMatch: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(suggestedMatchSchema))
    .mutation(async ({ ctx }) => {
      const [
        allInvoices,
        allPurchases,
        txResult,
        allocByInvoice,
        allocByPurchase,
        allocByTxInvoice,
        allocByTxPurchase,
      ] = await Promise.all([
        getInvoices(ctx.user.id),
        getPurchases(ctx.user.id),
        getTransactions(ctx.user.id, {}),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByPurchase(ctx.user.id),
        getAllocatedByTransaction(ctx.user.id),
        getPurchaseAllocatedByTransaction(ctx.user.id),
      ])

      const invoiceDocs = allInvoices
        .filter((inv) => inv.status !== "cancelled")
        .map((inv) => {
          const { total } = calcInvoiceTotals(inv.items, inv.totalCents)
          const allocated = allocByInvoice.get(inv.id) ?? 0
          return {
            id: inv.id,
            kind: "invoice" as const,
            number: inv.number,
            contactName: inv.client?.name ?? null,
            issueDate: inv.issueDate.toISOString().slice(0, 10),
            totalCents: Math.round(total),
            allocatedCents: allocated,
            currencyCode: inv.currencyCode || "EUR",
            notes: inv.notes,
          }
        })
        .filter((d) => d.allocatedCents < d.totalCents)

      const purchaseDocs = allPurchases
        .filter((p) => p.status !== "cancelled")
        .map((p) => {
          const { total } = calcInvoiceTotals(p.items, p.totalCents)
          const allocated = allocByPurchase.get(p.id) ?? 0
          return {
            id: p.id,
            kind: "purchase" as const,
            number: p.supplierInvoiceNumber,
            contactName: p.contact?.name ?? null,
            issueDate: p.issueDate.toISOString().slice(0, 10),
            totalCents: Math.round(total),
            allocatedCents: allocated,
            currencyCode: p.currencyCode || "EUR",
            notes: p.notes,
          }
        })
        .filter((d) => d.allocatedCents < d.totalCents)

      const documents = [...invoiceDocs, ...purchaseDocs]

      const transactions = txResult.transactions
        .map((tx) => {
          const fromInvoices = allocByTxInvoice.get(tx.id) ?? 0
          const fromPurchases = allocByTxPurchase.get(tx.id) ?? 0
          return {
            id: tx.id,
            name: tx.name,
            merchant: tx.merchant,
            issuedAt: tx.issuedAt ? tx.issuedAt.toISOString().slice(0, 10) : null,
            totalCents: Math.abs(tx.total ?? 0),
            type: tx.type,
            currencyCode: tx.currencyCode,
            allocatedCents: fromInvoices + fromPurchases,
          }
        })
        .filter((tx) => tx.allocatedCents < tx.totalCents)
        .filter((tx) => tx.type === "income" || tx.type === "expense")

      if (documents.length === 0 || transactions.length === 0) return []

      return matchDocumentsToTransactions(documents, transactions, ctx.user.id)
    }),

  /** Dispatch a single allocation to whichever side the document belongs to.
   * Lets the UI call one mutation without knowing whether it's accepting an
   * invoice or a purchase match. */
  allocate: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        documentKind: docKindSchema,
        transactionId: z.string(),
        amountCents: z.number().int().positive(),
        source: z.enum(["manual", "ai"]).default("manual"),
        note: z.string().max(512).nullish(),
      }),
    )
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      if (input.documentKind === "invoice") {
        const res = await createInvoicePayment(ctx.user.id, {
          invoiceId: input.documentId,
          transactionId: input.transactionId,
          amountCents: input.amountCents,
          source: input.source,
          note: input.note ?? null,
        })
        if (!res) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to allocate invoice payment",
          })
        }
        await maybeAutoFlipPaid(input.documentId, ctx.user.id)
      } else {
        const res = await createPurchasePayment(ctx.user.id, {
          purchaseId: input.documentId,
          transactionId: input.transactionId,
          amountCents: input.amountCents,
          source: input.source,
          note: input.note ?? null,
        })
        if (!res) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to allocate purchase payment",
          })
        }
        // Mirror the PDF onto the paying transaction so the receipt is
        // visible from both surfaces — same behavior as purchasePayments.create.
        const purchase = await getPurchaseById(input.documentId, ctx.user.id)
        if (purchase?.pdfFileId) {
          await attachFileToTransaction(
            ctx.user.id,
            input.transactionId,
            purchase.pdfFileId,
          )
        }
        await maybeAutoFlipPaidPurchase(input.documentId, ctx.user.id)
      }
      return { ok: true as const }
    }),

  /** List every allocation (invoice or purchase payment) bound to one
   * transaction, with enough document info to render a card without a
   * second round-trip. Used by the transaction detail page. */
  allocationsForTransaction: authedProcedure
    .input(z.object({ transactionId: z.string() }))
    .output(z.array(transactionAllocationSchema))
    .query(async ({ ctx, input }) => {
      const [invoicePayments, purchasePayments] = await Promise.all([
        listPaymentsForTransaction(input.transactionId, ctx.user.id),
        listPurchasePaymentsForTransaction(input.transactionId, ctx.user.id),
      ])
      if (invoicePayments.length === 0 && purchasePayments.length === 0) return []

      // Batch-resolve the documents rather than getById-per-row. For small
      // payment counts this is the same as getById, but avoids N+1 queries
      // when an AI pass has created many allocations against one tx.
      const [invoices, purchases] = await Promise.all([
        invoicePayments.length > 0 ? getInvoices(ctx.user.id) : Promise.resolve([]),
        purchasePayments.length > 0 ? getPurchases(ctx.user.id) : Promise.resolve([]),
      ])
      const invById = new Map(invoices.map((i) => [i.id, i]))
      const purById = new Map(purchases.map((p) => [p.id, p]))

      const rows: Array<z.infer<typeof transactionAllocationSchema>> = []

      for (const ip of invoicePayments) {
        const inv = invById.get(ip.invoiceId)
        if (!inv) continue
        const { total } = calcInvoiceTotals(inv.items, inv.totalCents)
        rows.push({
          paymentId: ip.id,
          documentKind: "invoice",
          documentId: inv.id,
          documentNumber: inv.number,
          contactName: inv.client?.name ?? null,
          issueDate: inv.issueDate,
          documentTotalCents: Math.round(total),
          documentCurrencyCode: inv.currencyCode || "EUR",
          amountCents: ip.amountCents,
          source: ip.source,
          note: ip.note,
          createdAt: ip.createdAt,
        })
      }

      for (const pp of purchasePayments) {
        const pur = purById.get(pp.purchaseId)
        if (!pur) continue
        const { total } = calcInvoiceTotals(pur.items, pur.totalCents)
        rows.push({
          paymentId: pp.id,
          documentKind: "purchase",
          documentId: pur.id,
          documentNumber: pur.supplierInvoiceNumber,
          contactName: pur.contact?.name ?? null,
          issueDate: pur.issueDate,
          documentTotalCents: Math.round(total),
          documentCurrencyCode: pur.currencyCode || "EUR",
          amountCents: pp.amountCents,
          source: pp.source,
          note: pp.note,
          createdAt: pp.createdAt,
        })
      }

      return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }),

  /** List every existing doc↔tx allocation for the user, optionally filtered
   *  to one document kind. Used by the "Linked" tabs on the reconcile page
   *  so users can review, edit, or cancel connections they (or the AI)
   *  already made. */
  links: authedProcedure
    .input(
      z.object({
        kind: docKindSchema.optional(),
      }).optional(),
    )
    .output(z.array(linkedPairSchema))
    .query(async ({ ctx, input }) => {
      const kind = input?.kind
      const [invoicePayments, purchasePayments] = await Promise.all([
        kind === "purchase" ? Promise.resolve([]) : listAllInvoicePayments(ctx.user.id),
        kind === "invoice" ? Promise.resolve([]) : listAllPurchasePayments(ctx.user.id),
      ])
      if (invoicePayments.length === 0 && purchasePayments.length === 0) return []

      // Collect distinct document + transaction ids to batch-resolve metadata
      // in a fixed number of queries rather than N per row.
      const txIds = new Set<string>()
      invoicePayments.forEach((p) => txIds.add(p.transactionId))
      purchasePayments.forEach((p) => txIds.add(p.transactionId))

      const [invoices, purchases, txs] = await Promise.all([
        invoicePayments.length > 0 ? getInvoices(ctx.user.id) : Promise.resolve([]),
        purchasePayments.length > 0 ? getPurchases(ctx.user.id) : Promise.resolve([]),
        Promise.all(
          Array.from(txIds).map((id) => getTransactionById(id, ctx.user.id)),
        ),
      ])
      const invById = new Map(invoices.map((i) => [i.id, i]))
      const purById = new Map(purchases.map((p) => [p.id, p]))
      const txById = new Map(
        txs.filter((t): t is NonNullable<typeof t> => t !== null).map((t) => [t.id, t]),
      )

      const rows: Array<z.infer<typeof linkedPairSchema>> = []

      for (const ip of invoicePayments) {
        const inv = invById.get(ip.invoiceId)
        const tx = txById.get(ip.transactionId)
        if (!inv || !tx) continue
        const { total } = calcInvoiceTotals(inv.items, inv.totalCents)
        rows.push({
          paymentId: ip.id,
          documentKind: "invoice",
          documentId: inv.id,
          documentNumber: inv.number,
          documentContactName: inv.client?.name ?? null,
          documentIssueDate: inv.issueDate,
          documentTotalCents: Math.round(total),
          documentCurrencyCode: inv.currencyCode || "EUR",
          transactionId: tx.id,
          transactionName: tx.name,
          transactionMerchant: tx.merchant,
          transactionIssuedAt: tx.issuedAt,
          transactionTotalCents: Math.abs(tx.total ?? 0),
          transactionType: tx.type,
          transactionCurrencyCode: tx.currencyCode,
          amountCents: ip.amountCents,
          source: ip.source,
          createdAt: ip.createdAt,
        })
      }

      for (const pp of purchasePayments) {
        const pur = purById.get(pp.purchaseId)
        const tx = txById.get(pp.transactionId)
        if (!pur || !tx) continue
        const { total } = calcInvoiceTotals(pur.items, pur.totalCents)
        rows.push({
          paymentId: pp.id,
          documentKind: "purchase",
          documentId: pur.id,
          documentNumber: pur.supplierInvoiceNumber,
          documentContactName: pur.contact?.name ?? null,
          documentIssueDate: pur.issueDate,
          documentTotalCents: Math.round(total),
          documentCurrencyCode: pur.currencyCode || "EUR",
          transactionId: tx.id,
          transactionName: tx.name,
          transactionMerchant: tx.merchant,
          transactionIssuedAt: tx.issuedAt,
          transactionTotalCents: Math.abs(tx.total ?? 0),
          transactionType: tx.type,
          transactionCurrencyCode: tx.currencyCode,
          amountCents: pp.amountCents,
          source: pp.source,
          createdAt: pp.createdAt,
        })
      }

      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }),

  /** Change the allocated amount on an existing payment. Re-runs the
   *  auto-flip-paid logic afterwards so the document status stays in sync
   *  with the new total of allocations. */
  updateAllocationAmount: authedProcedure
    .input(
      z.object({
        paymentId: z.string(),
        documentKind: docKindSchema,
        amountCents: z.number().int().positive(),
      }),
    )
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      if (input.documentKind === "invoice") {
        const existing = await getInvoicePaymentById(input.paymentId, ctx.user.id)
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" })
        }
        await updateInvoicePaymentAmount(
          input.paymentId,
          ctx.user.id,
          input.amountCents,
        )
        await maybeAutoFlipPaid(existing.invoiceId, ctx.user.id)
      } else {
        const existing = await getPurchasePaymentById(input.paymentId, ctx.user.id)
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" })
        }
        await updatePurchasePaymentAmount(
          input.paymentId,
          ctx.user.id,
          input.amountCents,
        )
        await maybeAutoFlipPaidPurchase(existing.purchaseId, ctx.user.id)
      }
      return { ok: true as const }
    }),

  /** Snap drifted document totals to their allocation amounts.
   *
   *  A document qualifies when:
   *   - `totalCents` is currently NULL (display reconstructs from items)
   *   - the allocated sum is within DRIFT_LIMIT of the reconstructed total
   *   - drift is non-zero (nothing to fix if they already agree)
   *
   *  For qualifying rows, `totalCents` is set to the allocated sum — because
   *  the bank-recorded amount is the ground truth for what the supplier
   *  actually charged. Docs with legitimate partial payments (drift >
   *  DRIFT_LIMIT) are skipped.
   *
   *  `dryRun=true` returns only the counts for a preview modal.
   *
   *  BOUNDS: documents with zero or multiple payments whose sum matches the
   *  computed total exactly are untouched — no need to fix what isn't broken.
   */
  snapDriftedTotals: authedProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(false),
      }).optional(),
    )
    .output(
      z.object({
        invoicesFixed: z.number().int(),
        purchasesFixed: z.number().int(),
        skippedDifferenceTooLarge: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false
      const DRIFT_LIMIT_CENTS = 100 // €1.00 — same threshold as the UI badge

      const [invoices, purchases, allocByInvoice, allocByPurchase] = await Promise.all([
        getInvoices(ctx.user.id),
        getPurchases(ctx.user.id),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByPurchase(ctx.user.id),
      ])

      let invoicesFixed = 0
      let purchasesFixed = 0
      let skippedDifferenceTooLarge = 0

      for (const inv of invoices) {
        if (inv.totalCents !== null && inv.totalCents !== undefined) continue
        const allocated = allocByInvoice.get(inv.id) ?? 0
        if (allocated === 0) continue
        const { total } = calcInvoiceTotals(inv.items, null)
        const computed = Math.round(total)
        const diff = Math.abs(allocated - computed)
        if (diff === 0) continue
        if (diff > DRIFT_LIMIT_CENTS) {
          skippedDifferenceTooLarge++
          continue
        }
        if (!dryRun) {
          await updateInvoiceTotalCents(inv.id, ctx.user.id, allocated)
        }
        invoicesFixed++
      }

      for (const pur of purchases) {
        if (pur.totalCents !== null && pur.totalCents !== undefined) continue
        const allocated = allocByPurchase.get(pur.id) ?? 0
        if (allocated === 0) continue
        const { total } = calcInvoiceTotals(pur.items, null)
        const computed = Math.round(total)
        const diff = Math.abs(allocated - computed)
        if (diff === 0) continue
        if (diff > DRIFT_LIMIT_CENTS) {
          skippedDifferenceTooLarge++
          continue
        }
        if (!dryRun) {
          await updatePurchaseTotalCents(pur.id, ctx.user.id, allocated)
        }
        purchasesFixed++
      }

      return { invoicesFixed, purchasesFixed, skippedDifferenceTooLarge }
    }),

  /** Re-derive `paid` status for documents whose payment rows are gone.
   *
   *  When a transaction is deleted the FK cascade removes its `invoice_payments`
   *  / `purchase_payments` rows, but the invoice/purchase `status` stays at
   *  'paid' because auto-flip is forward-only (see the comment on
   *  `maybeAutoFlipPaid`). That leaves stale "paid" docs with zero linked
   *  payments — this mutation finds them and reverts the status.
   *
   *  Conservative: only flips when allocated = 0. If some partial payments
   *  remain, leave the doc as 'paid' so the user can adjust manually — drift
   *  is already surfaced in the UI.
   *
   *  Targets:
   *    invoices: paid → sent (paid_at cleared)
   *    purchases: paid → received (paid_at cleared)
   *
   *  `dryRun=true` returns counts only for a preview modal. */
  resyncPaidStatus: authedProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(false),
      }).optional(),
    )
    .output(
      z.object({
        invoicesResynced: z.number().int(),
        purchasesResynced: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false

      const [invoices, purchases, allocByInvoice, allocByPurchase] = await Promise.all([
        getInvoices(ctx.user.id),
        getPurchases(ctx.user.id),
        getAllocatedByInvoice(ctx.user.id),
        getAllocatedByPurchase(ctx.user.id),
      ])

      let invoicesResynced = 0
      let purchasesResynced = 0

      for (const inv of invoices) {
        if (inv.status !== "paid") continue
        const allocated = allocByInvoice.get(inv.id) ?? 0
        if (allocated > 0) continue
        if (!dryRun) {
          await updateInvoiceStatus(inv.id, ctx.user.id, "sent")
        }
        invoicesResynced++
      }

      for (const pur of purchases) {
        if (pur.status !== "paid") continue
        const allocated = allocByPurchase.get(pur.id) ?? 0
        if (allocated > 0) continue
        if (!dryRun) {
          await updatePurchaseStatus(pur.id, ctx.user.id, "received", null)
        }
        purchasesResynced++
      }

      return { invoicesResynced, purchasesResynced }
    }),

  /** Unlink one allocation by its payment id. Kind must be supplied because
   * invoice_payments and purchase_payments live in separate tables with no
   * shared id space. Does NOT un-flip document status — if the user had set
   * "paid" manually that was their choice; if auto-flip had set it, the
   * document will be shown as "paid" until the user manually changes it. */
  unallocate: authedProcedure
    .input(
      z.object({
        paymentId: z.string(),
        documentKind: docKindSchema,
      }),
    )
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      if (input.documentKind === "invoice") {
        const existing = await getInvoicePaymentById(input.paymentId, ctx.user.id)
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" })
        }
        await deleteInvoicePayment(input.paymentId, ctx.user.id)
      } else {
        const existing = await getPurchasePaymentById(input.paymentId, ctx.user.id)
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" })
        }
        await deletePurchasePayment(input.paymentId, ctx.user.id)
      }
      return { ok: true as const }
    }),
})
