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
  getTransactionDateRange,
} from "@/models/transactions"
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
import { sql, queryMany } from "@/lib/sql"

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
})
