import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  updateTransactionFiles,
  deleteTransaction,
  bulkDeleteTransactions,
  bulkUpdateTransactionType,
  getTransactionDateRange,
} from "@/models/transactions"
import { classifyTransaction } from "@/lib/classify-transaction"
import type { TransactionData, TransactionFilters } from "@/models/transactions"
import { attachFileToTransaction, getFileById } from "@/models/files"
import { linkTransferPair, unlinkTransfer } from "@/models/transfers"
import { TRPCError } from "@trpc/server"
import {
  transactionSchema,
  categorySchema,
  projectSchema,
  type Transaction,
} from "@/lib/db-types"
import { getActiveEntityId } from "@/lib/entities"
import { sql, queryMany, execute } from "@/lib/sql"

// Transaction with joined category/project relations
const transactionWithRelationsSchema = transactionSchema.extend({
  category: categorySchema.nullable().optional(),
  project: projectSchema.nullable().optional(),
}).passthrough()

const transactionFiltersSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  ordering: z.string().optional(),
  accountId: z.string().optional(),
  categoryCode: z.string().optional(),
  projectCode: z.string().optional(),
  type: z.string().optional(),
  hasReceipts: z.enum(["missing", "attached", ""]).optional(),
  page: z.number().int().optional(),
  limit: z.number().int().optional(),
})

const transactionInputSchema = z.object({
  name: z.string().nullish(),
  description: z.string().nullish(),
  merchant: z.string().nullish(),
  total: z.number().nullish(),
  currencyCode: z.string().nullish(),
  convertedTotal: z.number().nullish(),
  convertedCurrencyCode: z.string().nullish(),
  type: z.string().nullish(),
  items: z.any().optional(),
  note: z.string().nullish(),
  files: z.array(z.string()).optional(),
  extra: z.any().optional(),
  accountId: z.string().nullish(),
  categoryCode: z.string().nullish(),
  projectCode: z.string().nullish(),
  issuedAt: z.union([z.date(), z.string()]).nullish(),
  text: z.string().nullish(),
  deductible: z.boolean().nullish(),
}).passthrough()

export const transactionsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/transactions" } })
    .input(transactionFiltersSchema)
    .output(z.object({
      transactions: z.array(transactionWithRelationsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const filters: TransactionFilters = {
        ...(input.search !== undefined && { search: input.search }),
        ...(input.dateFrom !== undefined && { dateFrom: input.dateFrom }),
        ...(input.dateTo !== undefined && { dateTo: input.dateTo }),
        ...(input.ordering !== undefined && { ordering: input.ordering }),
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.categoryCode !== undefined && { categoryCode: input.categoryCode }),
        ...(input.projectCode !== undefined && { projectCode: input.projectCode }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.hasReceipts !== undefined && { hasReceipts: input.hasReceipts }),
        ...(input.page !== undefined && { page: input.page }),
      }
      const limit = input.limit ?? 50
      const page = input.page ?? 1
      const pagination = { limit, offset: (page - 1) * limit }
      return getTransactions(ctx.user.id, filters, pagination)
    }),

  dateRange: authedProcedure
    .input(transactionFiltersSchema)
    .output(z.object({
      earliest: z.string().nullable(),
      latest: z.string().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      const filters: TransactionFilters = {
        ...(input.search !== undefined && { search: input.search }),
        ...(input.dateFrom !== undefined && { dateFrom: input.dateFrom }),
        ...(input.dateTo !== undefined && { dateTo: input.dateTo }),
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.categoryCode !== undefined && { categoryCode: input.categoryCode }),
        ...(input.projectCode !== undefined && { projectCode: input.projectCode }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.hasReceipts !== undefined && { hasReceipts: input.hasReceipts }),
      }
      return getTransactionDateRange(ctx.user.id, filters)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/transactions/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(transactionWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getTransactionById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/transactions" } })
    .input(transactionInputSchema)
    .output(transactionSchema.passthrough())
    .mutation(async ({ ctx, input }) => {
      return createTransaction(ctx.user.id, input as TransactionData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/transactions/{id}" } })
    .input(z.object({ id: z.string() }).merge(transactionInputSchema))
    .output(transactionSchema.passthrough())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateTransaction(id, ctx.user.id, data as TransactionData)
    }),

  updateFiles: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/transactions/{id}/files" } })
    .input(z.object({ id: z.string(), files: z.array(z.string()) }))
    .output(transactionSchema.passthrough())
    .mutation(async ({ ctx, input }) => {
      return updateTransactionFiles(input.id, ctx.user.id, input.files)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/transactions/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(transactionWithRelationsSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const entityId = await getActiveEntityId()
      return deleteTransaction(input.id, ctx.user.id, entityId)
    }),

  bulkDelete: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/transactions/bulk-delete" } })
    .input(z.object({ ids: z.array(z.string()) }))
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const entityId = await getActiveEntityId()
      return bulkDeleteTransactions(input.ids, ctx.user.id, entityId)
    }),

  /** Scan the user's transactions with a deterministic heuristic classifier
   *  and return the rows whose description/merchant/amount suggests a
   *  different type than what's currently stored. Used by the Reclassify
   *  dialog to help catch long-tail misclassifications without AI calls. */
  reclassifySuggestions: authedProcedure
    .input(z.object({}).optional())
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string().nullable(),
          merchant: z.string().nullable(),
          description: z.string().nullable(),
          issuedAt: z.date().nullable(),
          total: z.number().nullable(),
          currencyCode: z.string().nullable(),
          currentType: z.string().nullable(),
          suggestedType: z.enum([
            "income",
            "expense",
            "refund",
            "transfer",
            "exchange",
            "other",
          ]),
          reason: z.string(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const result = await getTransactions(ctx.user.id, {})
      const proposals: Array<{
        id: string
        name: string | null
        merchant: string | null
        description: string | null
        issuedAt: Date | null
        total: number | null
        currencyCode: string | null
        currentType: string | null
        suggestedType: "income" | "expense" | "refund" | "transfer" | "exchange" | "other"
        reason: string
      }> = []
      for (const tx of result.transactions) {
        const hit = classifyTransaction({
          name: tx.name,
          merchant: tx.merchant,
          description: tx.description,
          total: tx.total,
          type: tx.type,
        })
        if (!hit) continue
        if (hit.suggested === tx.type) continue
        proposals.push({
          id: tx.id,
          name: tx.name,
          merchant: tx.merchant,
          description: tx.description,
          issuedAt: tx.issuedAt,
          total: tx.total,
          currencyCode: tx.currencyCode,
          currentType: tx.type,
          suggestedType: hit.suggested,
          reason: hit.reason,
        })
      }
      return proposals
    }),

  /** Set `type` on a list of transactions in one round trip. Used by the
   *  inline type editor and the Reclassify bulk-apply. */
  bulkSetType: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/transactions/bulk-set-type" } })
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(1000),
        type: z.enum([
          "income",
          "expense",
          "refund",
          "transfer",
          "exchange",
          "other",
        ]),
      }),
    )
    .output(z.object({ updated: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return bulkUpdateTransactionType(ctx.user.id, input.ids, input.type)
    }),

  /**
   * Attach an already-stored file (e.g. an orphan receipt) to this
   * transaction's `files` jsonb array. Both rows must belong to the
   * current user.
   */
  attachFile: authedProcedure
    .input(z.object({ transactionId: z.string(), fileId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const file = await getFileById(input.fileId, ctx.user.id)
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" })
      }
      const ok = await attachFileToTransaction(
        ctx.user.id,
        input.transactionId,
        input.fileId,
      )
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      }
      return { ok: true }
    }),

  confirmTransferLink: authedProcedure
    .input(z.object({
      outgoingId: z.string().uuid(),
      outgoingAccountId: z.string().uuid(),
      incomingId: z.string().uuid(),
      incomingAccountId: z.string().uuid(),
    }))
    .output(z.object({ transferId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return linkTransferPair({ userId: ctx.user.id, ...input })
    }),

  unlinkTransfer: authedProcedure
    .input(z.object({ transferId: z.string().uuid() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await unlinkTransfer({ userId: ctx.user.id, transferId: input.transferId })
      return { ok: true }
    }),

  /**
   * Set `counter_account_id` on a transfer row. When a non-null account is
   * supplied, also try to pair the row with an existing opposite-direction
   * unpaired row on that account (strict matcher: same amount, currency,
   * ±1 day). If a unique match is found, both rows get a shared transfer_id
   * and the orphan state flips to paired. Otherwise counter_account_id is set
   * but the row stays orphan (awaiting match).
   */
  setCounterAccount: authedProcedure
    .input(z.object({
      id: z.string().uuid(),
      counterAccountId: z.string().uuid().nullable(),
    }))
    .output(z.object({ ok: z.boolean(), paired: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // First: persist the user's choice regardless of pairing outcome.
      await execute(
        sql`UPDATE transactions
            SET counter_account_id = ${input.counterAccountId}
            WHERE id = ${input.id} AND user_id = ${ctx.user.id}`,
      )

      if (input.counterAccountId === null) return { ok: true, paired: false }

      // Load the row we just updated so we can search for a matching leg.
      const [row] = await queryMany<Transaction>(
        sql`SELECT * FROM transactions WHERE id = ${input.id} AND user_id = ${ctx.user.id} LIMIT 1`,
      )
      if (!row) return { ok: true, paired: false }
      if (row.transferId !== null) return { ok: true, paired: true }
      if (row.type !== "transfer") return { ok: true, paired: false }
      if (row.transferDirection === null || row.accountId === null) return { ok: true, paired: false }
      if (row.total === null || row.currencyCode === null || row.issuedAt === null) {
        return { ok: true, paired: false }
      }

      // Opposite direction of this leg — an "outgoing" leg needs an "incoming" partner.
      const oppositeDirection = row.transferDirection === "outgoing" ? "incoming" : "outgoing"
      const oneDayMs = 24 * 60 * 60 * 1000
      const issuedAtDate = row.issuedAt instanceof Date ? row.issuedAt : new Date(row.issuedAt)
      const lower = new Date(issuedAtDate.getTime() - oneDayMs)
      const upper = new Date(issuedAtDate.getTime() + oneDayMs)

      const candidates = await queryMany<Transaction>(
        sql`SELECT * FROM transactions
            WHERE user_id = ${ctx.user.id}
              AND id <> ${row.id}
              AND account_id = ${input.counterAccountId}
              AND ABS(total) = ABS(${row.total})
              AND currency_code = ${row.currencyCode}
              AND issued_at >= ${lower}
              AND issued_at <= ${upper}
              AND transfer_id IS NULL
              AND (
                type = 'transfer' AND transfer_direction = ${oppositeDirection}
                OR type = ${row.transferDirection === "outgoing" ? "income" : "expense"}
              )
            LIMIT 2`,
      )
      if (candidates.length !== 1) return { ok: true, paired: false }
      const partner = candidates[0]!
      if (partner.accountId === null) return { ok: true, paired: false }

      // Pair them. outgoing = this row when direction=outgoing, else partner.
      const outgoingId = row.transferDirection === "outgoing" ? row.id : partner.id
      const outgoingAccount = row.transferDirection === "outgoing" ? row.accountId : partner.accountId
      const incomingId = row.transferDirection === "outgoing" ? partner.id : row.id
      const incomingAccount = row.transferDirection === "outgoing" ? partner.accountId : row.accountId
      await linkTransferPair({
        userId: ctx.user.id,
        outgoingId,
        outgoingAccountId: outgoingAccount,
        incomingId,
        incomingAccountId: incomingAccount,
      })
      return { ok: true, paired: true }
    }),

  getPairedLeg: authedProcedure
    .input(z.object({
      transferId: z.string().uuid(),
      excludeId: z.string().uuid(),
    }))
    .output(transactionSchema.nullable())
    .query(async ({ ctx, input }) => {
      const rows = await queryMany<Transaction>(
        sql`SELECT * FROM transactions
            WHERE transfer_id = ${input.transferId}
              AND id <> ${input.excludeId}
              AND user_id = ${ctx.user.id}
            LIMIT 1`,
      )
      return rows[0] ?? null
    }),

  /**
   * Bulk-pair unpaired transfer candidates across two accounts.
   *
   * Strict matcher: same amount, same currency, ±1 day, opposite direction.
   * - from-account contributes the OUTGOING leg (type='expense' OR
   *   type='transfer' with direction='outgoing')
   * - to-account contributes the INCOMING leg (type='income' OR
   *   type='transfer' with direction='incoming')
   *
   * Ambiguous candidates (one outgoing matching multiple incomings or vice
   * versa) are skipped — only the uniquely-closest-in-time pair is linked.
   */
  pairTransfersBulk: authedProcedure
    .input(z.object({
      fromAccountId: z.string().uuid(),
      toAccountId: z.string().uuid(),
      sinceDate: z.string().nullable().optional(),
    }))
    .output(z.object({ paired: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sinceDate = input.sinceDate ? new Date(input.sinceDate) : null
      // We build two branches so we can use the sql tagged template without
      // nested sql`` values (the helper only supports parameter interpolation).
      const query = sinceDate
        ? sql`WITH candidates AS (
                SELECT
                  o.id AS from_id,
                  i.id AS to_id,
                  o.account_id AS from_account,
                  i.account_id AS to_account,
                  ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY ABS(EXTRACT(EPOCH FROM (o.issued_at - i.issued_at))), i.id) AS rn_o,
                  ROW_NUMBER() OVER (PARTITION BY i.id ORDER BY ABS(EXTRACT(EPOCH FROM (i.issued_at - o.issued_at))), o.id) AS rn_i
                FROM transactions o
                JOIN transactions i
                  ON o.user_id = i.user_id
                 AND ABS(o.total) = ABS(i.total)
                 AND o.currency_code = i.currency_code
                 AND o.issued_at BETWEEN i.issued_at - interval '1 day' AND i.issued_at + interval '1 day'
                WHERE o.user_id = ${ctx.user.id}
                  AND o.account_id = ${input.fromAccountId}
                  AND i.account_id = ${input.toAccountId}
                  AND o.transfer_id IS NULL
                  AND i.transfer_id IS NULL
                  -- The user's fromAccountId/toAccountId argument supplies the
                  -- direction implicitly, so we accept transfer rows regardless
                  -- of whether transfer_direction has been set. Rows classified
                  -- type='other' are also candidates because Swissborg-style
                  -- imports sometimes land withdrawals/deposits as 'other'.
                  AND o.type IN ('expense', 'transfer', 'other')
                  AND i.type IN ('income', 'transfer', 'other')
                  AND o.issued_at >= ${sinceDate}
                  AND i.issued_at >= ${sinceDate}
              )
              SELECT from_id, to_id, from_account, to_account FROM candidates
              WHERE rn_o = 1 AND rn_i = 1`
        : sql`WITH candidates AS (
                SELECT
                  o.id AS from_id,
                  i.id AS to_id,
                  o.account_id AS from_account,
                  i.account_id AS to_account,
                  ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY ABS(EXTRACT(EPOCH FROM (o.issued_at - i.issued_at))), i.id) AS rn_o,
                  ROW_NUMBER() OVER (PARTITION BY i.id ORDER BY ABS(EXTRACT(EPOCH FROM (i.issued_at - o.issued_at))), o.id) AS rn_i
                FROM transactions o
                JOIN transactions i
                  ON o.user_id = i.user_id
                 AND ABS(o.total) = ABS(i.total)
                 AND o.currency_code = i.currency_code
                 AND o.issued_at BETWEEN i.issued_at - interval '1 day' AND i.issued_at + interval '1 day'
                WHERE o.user_id = ${ctx.user.id}
                  AND o.account_id = ${input.fromAccountId}
                  AND i.account_id = ${input.toAccountId}
                  AND o.transfer_id IS NULL
                  AND i.transfer_id IS NULL
                  -- The user's fromAccountId/toAccountId argument supplies the
                  -- direction implicitly, so we accept transfer rows regardless
                  -- of whether transfer_direction has been set. Rows classified
                  -- type='other' are also candidates because Swissborg-style
                  -- imports sometimes land withdrawals/deposits as 'other'.
                  AND o.type IN ('expense', 'transfer', 'other')
                  AND i.type IN ('income', 'transfer', 'other')
              )
              SELECT from_id, to_id, from_account, to_account FROM candidates
              WHERE rn_o = 1 AND rn_i = 1`

      const pairs = await queryMany<{
        fromId: string
        toId: string
        fromAccount: string
        toAccount: string
      }>(query)

      let paired = 0
      for (const p of pairs) {
        try {
          await linkTransferPair({
            userId: ctx.user.id,
            outgoingId: p.fromId,
            outgoingAccountId: p.fromAccount,
            incomingId: p.toId,
            incomingAccountId: p.toAccount,
          })
          paired++
        } catch (err) {
          console.warn("[pairTransfersBulk] link failed:", err)
        }
      }
      return { paired }
    }),
})
