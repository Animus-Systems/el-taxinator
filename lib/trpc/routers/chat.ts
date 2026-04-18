import { z } from "zod"
import { router, authedProcedure } from "../init"
import { TRPCError } from "@trpc/server"
import { processChatTurn } from "@/ai/chat-agent"
import {
  listChatMessages,
  clearChatMessages,
  markMessageApplied,
} from "@/models/chat"
import { createRule, deleteRule, applyRuleToExistingTransactions } from "@/models/rules"
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  bulkUpdateTransactions,
} from "@/models/transactions"
import type { TransactionData } from "@/models/transactions"
import { createCategory } from "@/models/categories"
import { createProject } from "@/models/projects"
import { linkTransferPair } from "@/models/transfers"
import { sql, queryMany } from "@/lib/sql"
import { getActiveEntityId } from "@/lib/entities"
import {
  chatMessageSchema,
  proposedRuleSchema,
  proposedUpdateSchema,
  proposedActionSchema,
  ruleSpecSchema,
  bulkUpdateFilterSchema,
} from "@/lib/db-types"
import type { RuleSpec } from "@/lib/db-types"

// Normalize a parsed ruleSpec into the shape applyRuleToExistingTransactions expects.
// With `exactOptionalPropertyTypes`, the target type's optional fields do not allow
// `undefined`, so we conditionally spread only the defined entries.
function normalizeRuleSpec(spec: RuleSpec): Pick<RuleSpec, "matchType" | "matchField" | "matchValue"> & {
  categoryCode?: string | null
  projectCode?: string | null
  type?: string | null
} {
  return {
    matchType: spec.matchType,
    matchField: spec.matchField,
    matchValue: spec.matchValue,
    ...(spec.categoryCode !== undefined ? { categoryCode: spec.categoryCode } : {}),
    ...(spec.projectCode !== undefined ? { projectCode: spec.projectCode } : {}),
    ...(spec.type !== undefined ? { type: spec.type } : {}),
  }
}

export const chatRouter = router({
  list: authedProcedure
    .input(z.void().optional())
    .output(z.array(chatMessageSchema))
    .query(async ({ ctx }) => {
      return listChatMessages(ctx.user.id)
    }),

  send: authedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(8000),
        contextTransactionId: z.string().uuid().optional(),
      }),
    )
    .output(
      z.object({
        userMessage: chatMessageSchema,
        assistantMessage: chatMessageSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return processChatTurn({
        userId: ctx.user.id,
        content: input.content,
        ...(input.contextTransactionId !== undefined
          ? { contextTransactionId: input.contextTransactionId }
          : {}),
      })
    }),

  applyProposedRule: authedProcedure
    .input(z.object({ messageId: z.string() }))
    .output(z.object({ message: chatMessageSchema }))
    .mutation(async ({ ctx, input }) => {
      const messages = await listChatMessages(ctx.user.id)
      const msg = messages.find((m) => m.id === input.messageId)
      if (!msg) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" })
      }
      if (msg.appliedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied" })
      }
      const ruleRaw = msg.metadata?.proposedRule
      if (!ruleRaw) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No proposed rule on message" })
      }
      const rule = proposedRuleSchema.parse(ruleRaw)
      try {
        await createRule(ctx.user.id, {
          name: rule.name,
          matchType: rule.matchType,
          matchField: rule.matchField,
          matchValue: rule.matchValue,
          categoryCode: rule.categoryCode ?? null,
          projectCode: rule.projectCode ?? null,
          type: rule.type ?? null,
          priority: rule.priority ?? 100,
          source: "manual",
        })
      } catch (err) {
        throw new TRPCError({
          code: "CONFLICT",
          message: err instanceof Error ? err.message : "Could not create rule",
        })
      }
      const updated = await markMessageApplied(ctx.user.id, input.messageId)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found after apply" })
      }
      return { message: updated }
    }),

  applyProposedUpdate: authedProcedure
    .input(z.object({ messageId: z.string() }))
    .output(z.object({ message: chatMessageSchema }))
    .mutation(async ({ ctx, input }) => {
      const messages = await listChatMessages(ctx.user.id)
      const msg = messages.find((m) => m.id === input.messageId)
      if (!msg) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" })
      }
      if (msg.appliedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied" })
      }
      const updateRaw = msg.metadata?.proposedUpdate
      if (!updateRaw) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No proposed update on message" })
      }
      const patch = proposedUpdateSchema.parse(updateRaw)
      const tx = await getTransactionById(patch.transactionId, ctx.user.id)
      if (!tx) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
      }
      // updateTransaction signature is (id, userId, data: TransactionData)
      // TransactionData has [key: string]: unknown index signature, so patch.patch is compatible.
      await updateTransaction(patch.transactionId, ctx.user.id, patch.patch as TransactionData)
      const updated = await markMessageApplied(ctx.user.id, input.messageId)
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found after apply" })
      }
      return { message: updated }
    }),

  previewRuleApplication: authedProcedure
    .input(z.object({ ruleSpec: ruleSpecSchema }))
    .output(z.object({
      matchCount: z.number().int(),
      sampleIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await applyRuleToExistingTransactions(
        ctx.user.id,
        normalizeRuleSpec(input.ruleSpec),
        { dryRun: true },
      )
      return { matchCount: res.matchCount, sampleIds: res.sampleIds }
    }),

  previewBulkUpdate: authedProcedure
    .input(z.object({ filter: bulkUpdateFilterSchema }))
    .output(z.object({
      matchCount: z.number().int(),
      sampleIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bulkUpdateTransactions(
        ctx.user.id,
        input.filter,
        {},
        { dryRun: true },
      )
      return { matchCount: res.matchCount, sampleIds: res.sampleIds }
    }),

  applyProposedAction: authedProcedure
    .input(z.object({ messageId: z.string() }))
    .output(z.object({
      message: chatMessageSchema,
      result: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const messages = await listChatMessages(ctx.user.id)
      const msg = messages.find((m) => m.id === input.messageId)
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" })
      if (msg.appliedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied" })
      const actionRaw = msg.metadata?.proposedAction
      if (!actionRaw) throw new TRPCError({ code: "BAD_REQUEST", message: "No proposed action on message" })
      const action = proposedActionSchema.parse(actionRaw)

      let result: Record<string, unknown> = {}
      try {
        switch (action.kind) {
          case "createRule": {
            const rule = await createRule(ctx.user.id, {
              name: action.name,
              matchType: action.matchType,
              matchField: action.matchField,
              matchValue: action.matchValue,
              categoryCode: action.categoryCode ?? null,
              projectCode: action.projectCode ?? null,
              type: action.type ?? null,
              priority: action.priority ?? 100,
              source: "manual",
            })
            result = { rule }
            break
          }
          case "updateTransaction": {
            const tx = await getTransactionById(action.transactionId, ctx.user.id)
            if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
            await updateTransaction(action.transactionId, ctx.user.id, action.patch as TransactionData)
            result = { transactionId: action.transactionId }
            break
          }
          case "applyRuleToExisting": {
            const applied = await applyRuleToExistingTransactions(ctx.user.id, normalizeRuleSpec(action.ruleSpec), {})
            if (action.alsoCreate) {
              await createRule(ctx.user.id, {
                name: action.ruleSpec.name,
                matchType: action.ruleSpec.matchType,
                matchField: action.ruleSpec.matchField,
                matchValue: action.ruleSpec.matchValue,
                categoryCode: action.ruleSpec.categoryCode ?? null,
                projectCode: action.ruleSpec.projectCode ?? null,
                type: action.ruleSpec.type ?? null,
                priority: action.ruleSpec.priority ?? 100,
                source: "manual",
              })
            }
            result = { updated: applied.updated, matchCount: applied.matchCount }
            break
          }
          case "bulkUpdate": {
            const updated = await bulkUpdateTransactions(ctx.user.id, action.filter, action.patch, {})
            result = { updated: updated.updated, matchCount: updated.matchCount }
            break
          }
          case "createCategory": {
            const cat = await createCategory(ctx.user.id, {
              name: action.name,
              ...(action.color !== undefined ? { color: action.color } : {}),
              ...(action.llmPrompt !== undefined ? { llmPrompt: action.llmPrompt } : {}),
            })
            result = { category: cat }
            break
          }
          case "createProject": {
            const proj = await createProject(ctx.user.id, {
              name: action.name,
              ...(action.color !== undefined ? { color: action.color } : {}),
              ...(action.llmPrompt !== undefined ? { llmPrompt: action.llmPrompt } : {}),
            })
            result = { project: proj }
            break
          }
          case "deleteTransaction": {
            const tx = await getTransactionById(action.transactionId, ctx.user.id)
            if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" })
            const entityId = await getActiveEntityId()
            await deleteTransaction(action.transactionId, ctx.user.id, entityId)
            result = { deleted: true }
            break
          }
          case "deleteRule": {
            const deleted = await deleteRule(action.ruleId, ctx.user.id)
            if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" })
            result = { deleted: true }
            break
          }
          case "pairTransfersBulk": {
            const sinceDate = action.sinceDate ? new Date(action.sinceDate) : null
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
                        AND o.account_id = ${action.fromAccountId}
                        AND i.account_id = ${action.toAccountId}
                        AND o.transfer_id IS NULL
                        AND i.transfer_id IS NULL
                        -- Direction is implicit in from/to account args, so we
                        -- don't require transfer_direction (legacy rows may have
                        -- it NULL). 'other' also admitted because crypto-exchange
                        -- statements sometimes land withdrawals/deposits there.
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
                        AND o.account_id = ${action.fromAccountId}
                        AND i.account_id = ${action.toAccountId}
                        AND o.transfer_id IS NULL
                        AND i.transfer_id IS NULL
                        -- Direction is implicit in from/to account args, so we
                        -- don't require transfer_direction (legacy rows may have
                        -- it NULL). 'other' also admitted because crypto-exchange
                        -- statements sometimes land withdrawals/deposits there.
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
                console.warn("[chat.pairTransfersBulk] link failed:", err)
              }
            }
            result = { paired }
            break
          }
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Action failed",
        })
      }

      const updatedMessage = await markMessageApplied(ctx.user.id, input.messageId)
      if (!updatedMessage) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found after apply" })
      return { message: updatedMessage, result }
    }),

  clear: authedProcedure
    .input(z.void().optional())
    .output(z.object({ deleted: z.number().int() }))
    .mutation(async ({ ctx }) => {
      const deleted = await clearChatMessages(ctx.user.id)
      return { deleted }
    }),
})
