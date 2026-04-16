import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { getFileById, updateFile, attachFileToTransaction } from "@/models/files"
import {
  getTransactions,
  getTransactionById,
  createTransaction,
} from "@/models/transactions"
import { listAliases, upsertAlias } from "@/models/receipt-aliases"
import { matchReceiptsToTransactions } from "@/ai/match-receipts"
import type { File as DbFile } from "@/lib/db-types"

type ExtractedMetadata = {
  vendor: string | null
  vendorTaxId: string | null
  total: number | null
  vatRate: number | null
  issueDate: string | null
  currency: string | null
  paymentMethod: string | null
  notes: string | null
  confidence: number | null
}

function readExtracted(metadata: unknown): ExtractedMetadata | null {
  if (!metadata || typeof metadata !== "object") return null
  const md = metadata as Record<string, unknown>
  const extracted = md["extracted"]
  if (!extracted || typeof extracted !== "object") return null
  const ex = extracted as Record<string, unknown>
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null
  const asNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null
  return {
    vendor: asString(ex["vendor"]),
    vendorTaxId: asString(ex["vendorTaxId"]),
    total: asNumber(ex["total"]),
    vatRate: asNumber(ex["vatRate"]),
    issueDate: asString(ex["issueDate"]),
    currency: asString(ex["currency"]),
    paymentMethod: asString(ex["paymentMethod"]),
    notes: asString(ex["notes"]),
    confidence: asNumber(ex["confidence"]),
  }
}

const extractedSchema = z.object({
  vendor: z.string().nullable(),
  vendorTaxId: z.string().nullable(),
  total: z.number().nullable(),
  vatRate: z.number().nullable(),
  issueDate: z.string().nullable(),
  currency: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number().nullable(),
})

const receiptRowSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  mimetype: z.string(),
  extracted: extractedSchema,
})

const candidateTransactionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  merchant: z.string().nullable(),
  issuedAt: z.date().nullable(),
  totalCents: z.number(),
  currencyCode: z.string().nullable(),
  categoryCode: z.string().nullable(),
})

const suggestionSchema = z.object({
  fileId: z.string(),
  transactionId: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
})

const decisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("attach"),
    fileId: z.string(),
    transactionId: z.string(),
  }),
  z.object({
    action: z.literal("create"),
    fileId: z.string(),
    vendor: z.string(),
    totalEuros: z.number(),
    issueDate: z.string(),
    notes: z.string().nullable().optional(),
    currencyCode: z.string().optional(),
  }),
  z.object({
    action: z.literal("orphan"),
    fileId: z.string(),
  }),
])

async function loadReceipt(
  fileId: string,
  userId: string,
): Promise<{ file: DbFile; extracted: ExtractedMetadata } | null> {
  const file = await getFileById(fileId, userId)
  if (!file) return null
  const extracted = readExtracted(file.metadata)
  if (!extracted) return null
  return { file, extracted }
}

export const receiptsRouter = router({
  /**
   * Load the receipts rows the user just uploaded (plus any other unreviewed
   * files whose metadata has an `extracted` block). Review UI calls this to
   * render the per-row cards.
   */
  listPending: authedProcedure
    .input(z.object({ fileIds: z.array(z.string()).optional() }))
    .output(z.array(receiptRowSchema))
    .query(async ({ ctx, input }) => {
      const ids = input.fileIds ?? []
      if (ids.length === 0) return []
      const out = []
      for (const id of ids) {
        const loaded = await loadReceipt(id, ctx.user.id)
        if (!loaded) continue
        out.push({
          fileId: loaded.file.id,
          filename: loaded.file.filename,
          mimetype: loaded.file.mimetype,
          extracted: loaded.extracted,
        })
      }
      return out
    }),

  /**
   * Candidate expense transactions we could attach a receipt to — business-
   * status expenses in a date window that do not already have a file
   * attached. Small, so we send the full list to the client for the
   * "Change match" dropdown.
   */
  candidateTransactions: authedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }))
    .output(z.array(candidateTransactionSchema))
    .query(async ({ ctx, input }) => {
      const result = await getTransactions(ctx.user.id, {
        type: "expense",
        hasReceipts: "missing",
        ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
        ...(input.dateTo ? { dateTo: input.dateTo } : {}),
      })
      return result.transactions.map((tx) => ({
        id: tx.id,
        name: tx.name,
        merchant: tx.merchant,
        issuedAt: tx.issuedAt,
        totalCents: Math.abs(tx.total ?? 0),
        currencyCode: tx.currencyCode,
        categoryCode: tx.categoryCode,
      }))
    }),

  /**
   * Given a list of uploaded receipt file ids, match each against candidate
   * expense transactions using the alias table + LLM.
   */
  aiMatch: authedProcedure
    .input(z.object({ fileIds: z.array(z.string()).min(1) }))
    .output(z.array(suggestionSchema))
    .mutation(async ({ ctx, input }) => {
      const receipts = []
      for (const id of input.fileIds) {
        const loaded = await loadReceipt(id, ctx.user.id)
        if (!loaded) continue
        receipts.push({
          fileId: loaded.file.id,
          vendor: loaded.extracted.vendor,
          totalCents: loaded.extracted.total != null
            ? Math.round(loaded.extracted.total * 100)
            : null,
          date: loaded.extracted.issueDate,
        })
      }
      if (receipts.length === 0) return []

      const txResult = await getTransactions(ctx.user.id, {
        type: "expense",
        hasReceipts: "missing",
      })
      const transactions = txResult.transactions.map((tx) => ({
        id: tx.id,
        name: tx.name,
        merchant: tx.merchant,
        totalCents: Math.abs(tx.total ?? 0),
        date: tx.issuedAt ? tx.issuedAt.toISOString().slice(0, 10) : null,
        currencyCode: tx.currencyCode,
      }))
      if (transactions.length === 0) return []

      const aliasRows = await listAliases(ctx.user.id, 50)
      const aliases = aliasRows.map((a) => ({
        vendorPattern: a.vendorPattern,
        merchantPattern: a.merchantPattern,
      }))

      return matchReceiptsToTransactions(receipts, transactions, aliases, ctx.user.id)
    }),

  /**
   * Apply the user's per-row decisions. For each:
   *  - `attach`: append file to tx.files, mark reviewed, upsert alias.
   *  - `create`: insert new business-expense transaction, attach file.
   *  - `orphan`: mark reviewed, leave metadata.extracted for later reuse.
   */
  commit: authedProcedure
    .input(z.object({ decisions: z.array(decisionSchema).min(1) }))
    .output(z.object({
      attached: z.number(),
      created: z.number(),
      orphaned: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      let attached = 0
      let created = 0
      let orphaned = 0

      for (const decision of input.decisions) {
        const file = await getFileById(decision.fileId, ctx.user.id)
        if (!file) continue

        if (decision.action === "attach") {
          const ok = await attachFileToTransaction(
            ctx.user.id,
            decision.transactionId,
            decision.fileId,
          )
          if (!ok) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Transaction ${decision.transactionId} not found`,
            })
          }
          await updateFile(decision.fileId, ctx.user.id, { isReviewed: true })

          const extracted = readExtracted(file.metadata)
          const vendor = extracted?.vendor
          if (vendor) {
            const tx = await getTransactionById(decision.transactionId, ctx.user.id)
            const merchant = tx?.merchant ?? tx?.name
            if (merchant) {
              await upsertAlias(ctx.user.id, vendor, merchant, "accept")
            }
          }
          attached++
        } else if (decision.action === "create") {
          const totalCents = Math.round(decision.totalEuros * 100)
          const issuedAt = new Date(decision.issueDate)
          const nextTx = await createTransaction(ctx.user.id, {
            name: decision.vendor,
            merchant: decision.vendor,
            total: totalCents,
            currencyCode: decision.currencyCode ?? "EUR",
            type: "expense",
            status: "business",
            issuedAt,
            note: decision.notes ?? null,
            files: [decision.fileId],
          })
          await updateFile(decision.fileId, ctx.user.id, { isReviewed: true })
          if (nextTx.merchant) {
            await upsertAlias(ctx.user.id, decision.vendor, nextTx.merchant, "accept")
          }
          created++
        } else {
          await updateFile(decision.fileId, ctx.user.id, { isReviewed: true })
          orphaned++
        }
      }

      return { attached, created, orphaned }
    }),
})
