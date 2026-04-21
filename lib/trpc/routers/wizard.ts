import { randomUUID } from "crypto"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import {
  importSessionSchema,
  wizardMessageSchema,
  wizardAssistantReplySchema,
  businessFactSchema,
  businessFactValueSchema,
  bulkActionSchema,
} from "@/lib/db-types"
import {
  getImportSessionById,
  createImportSession,
  updateImportSession,
  deleteImportSession,
  appendMessage,
  beginTurn,
  endTurn,
  stealLock as stealLockModel,
  abandonSession as abandonSessionModel,
  reopenSession as reopenSessionModel,
  reopenCommittedSession,
  listResumableSessions,
  listArchivedSessions,
  listCommittedSessions,
} from "@/models/import-sessions"
import {
  listBusinessFacts,
  upsertBusinessFact,
  deleteBusinessFact,
  hasAnyBusinessFacts,
} from "@/models/business-facts"
import { listAnalysisForSession } from "@/models/ai-analysis-results"
import { getFilesByIds } from "@/models/files"
import { upsertIncomeSource } from "@/models/income-sources"
import {
  processWizardTurn,
  runOnboardingTurn,
  makeUserMessage,
  makeAssistantMessage,
  makeFailureMessage,
} from "@/ai/wizard"
import { buildSessionReport } from "@/ai/session-report"
import { getUserById } from "@/models/users"
import type { EntityType, TransactionReviewStatusValue } from "@/lib/db-types"
import type { TransactionCandidate } from "@/ai/import-csv"

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const resumableSessionSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  entryMode: z.string(),
  fileName: z.string().nullable(),
  fileType: z.string().nullable(),
  lastActivityAt: z.date(),
  candidateCount: z.number(),
  unresolvedCount: z.number(),
  pendingTurnAt: z.date().nullable(),
})

const wizardGetOutputSchema = z.object({
  session: importSessionSchema,
  messages: z.array(wizardMessageSchema),
  candidates: z.array(z.unknown()),
  businessFacts: z.array(businessFactSchema),
  pendingTurnAt: z.date().nullable(),
  contextFiles: z.array(
    z.object({
      id: z.string().uuid(),
      fileName: z.string(),
      fileType: z.string(),
    }),
  ),
})

const wizardSendTurnOutputSchema = z.object({
  reply: wizardAssistantReplySchema,
  messages: z.array(wizardMessageSchema),
  candidates: z.array(z.unknown()),
  ruleConflictNotes: z.array(z.string()),
})

const startManualOutputSchema = z.object({
  sessionId: z.string(),
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const wizardRouter = router({
  startManual: authedProcedure
    .input(z.object({ accountId: z.string().nullable().optional() }))
    .output(startManualOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id)
      const session = await createImportSession(ctx.user.id, {
        accountId: input.accountId ?? null,
        fileName: null,
        fileType: null,
        rowCount: 0,
        data: [],
        entryMode: "manual",
        title: `Manual session ${formatTitleTimestamp(new Date())}`,
        messages: [],
      })
      if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "session creation failed" })

      const opening = await runOnboardingTurn({
        userId: ctx.user.id,
        entityType: (user?.entityType as EntityType | null) ?? null,
        businessName: user?.businessName ?? null,
        hasFile: false,
      })
      await appendMessage(session.id, ctx.user.id, opening)

      return { sessionId: session.id }
    }),

  get: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(wizardGetOutputSchema)
    .query(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "session not found" })
      const businessFacts = await listBusinessFacts(ctx.user.id)
      const candidates = Array.isArray(session.data) ? (session.data as unknown[]) : []
      const messages = Array.isArray(session.messages) ? session.messages : []

      // Bulk-fetch attached context files so the UI can render chips without a
      // second round-trip. Preserve the attach order from `context_file_ids`
      // (a simple re-index after the batch load).
      const contextFileIds = readContextFileIds(session.contextFileIds)
      const contextFiles =
        contextFileIds.length === 0
          ? []
          : await (async () => {
              const rows = await getFilesByIds(contextFileIds, ctx.user.id)
              const byId = new Map(rows.map((r) => [r.id, r]))
              return contextFileIds
                .map((id) => byId.get(id))
                .filter((f): f is NonNullable<typeof f> => f !== undefined)
                .map((f) => ({ id: f.id, fileName: f.filename, fileType: f.mimetype }))
            })()

      return {
        session,
        messages,
        candidates,
        businessFacts,
        pendingTurnAt: session.pendingTurnAt,
        contextFiles,
      }
    }),

  /** Most recent AI analysis record per row in a session — reasoning text,
   *  provider/model, and the timestamp. The candidate panel uses this to
   *  surface "why did the AI classify this row this way?" in the expanded row
   *  detail. Returns a plain object keyed by rowIndex as a string (JSON-safe). */
  analysisForSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(
      z.record(
        z.string(),
        z.object({
          reasoning: z.string().nullable(),
          provider: z.string(),
          model: z.string().nullable(),
          createdAt: z.date(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listAnalysisForSession(input.sessionId, ctx.user.id)
      // Rows come ordered by created_at DESC, so the first hit per rowIndex
      // is the most recent one — that's what the UI should show.
      const byRow: Record<string, {
        reasoning: string | null
        provider: string
        model: string | null
        createdAt: Date
      }> = {}
      for (const r of rows) {
        if (r.rowIndex === null || r.rowIndex === undefined) continue
        const key = String(r.rowIndex)
        if (key in byRow) continue
        byRow[key] = {
          reasoning: r.reasoning ?? null,
          provider: r.provider,
          model: r.model ?? null,
          createdAt: r.createdAt,
        }
      }
      return byRow
    }),

  listResumable: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(resumableSessionSummarySchema))
    .query(async ({ ctx }) => {
      return listResumableSessions(ctx.user.id)
    }),

  listArchived: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(resumableSessionSummarySchema))
    .query(async ({ ctx }) => {
      return listArchivedSessions(ctx.user.id)
    }),

  listCommitted: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(resumableSessionSummarySchema))
    .query(async ({ ctx }) => {
      return listCommittedSessions(ctx.user.id)
    }),

  reopenSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await reopenSessionModel(input.sessionId, ctx.user.id)
      return { ok: true }
    }),

  /** Flip a committed session back to pending so its candidates can be
   *  re-committed. Typical use: the original commit failed silently (date
   *  parse bug, stale FK, …) and the user fixed the underlying issue; rather
   *  than rebuilding the whole session from the source file, reopen this one
   *  and hit commit again. Resets every candidate's `selected` flag to true
   *  and clears the commit diagnostics so the retry starts clean. */
  reopenCommitted: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(z.object({ ok: z.literal(true), rowCount: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { found, rowCount } = await reopenCommittedSession(input.sessionId, ctx.user.id)
      if (!found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found or not in a committed state.",
        })
      }
      return { ok: true as const, rowCount }
    }),

  deleteSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await deleteImportSession(input.sessionId, ctx.user.id)
      return { ok: true }
    }),

  getReportPreview: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    // `buildSessionReport` returns a rich nested object; tRPC transports it via
    // superjson so Date/jsonb fields survive the wire. Using z.any() here avoids
    // duplicating the SessionReport shape in Zod form — see ai/session-report.ts
    // for the canonical TypeScript type.
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return buildSessionReport(input.sessionId, ctx.user.id)
    }),

  sendTurn: authedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        userMessage: z.string().min(1).max(8000),
        focusRowIndexes: z.array(z.number()).optional(),
        locale: z.string().optional(),
      }),
    )
    .output(wizardSendTurnOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const claimed = await beginTurn(input.sessionId, ctx.user.id)
      if (!claimed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "TURN_IN_PROGRESS",
        })
      }

      // T1: persist user message immediately so a crash here is recoverable.
      const userMsg = makeUserMessage(input.userMessage)
      await appendMessage(input.sessionId, ctx.user.id, userMsg)

      try {
        const { reply, ruleConflictNotes } = await processWizardTurn({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          userMessage: input.userMessage,
          focusRowIndexes: input.focusRowIndexes ?? null,
          ...(input.locale !== undefined && { locale: input.locale }),
        })

        // T2: persist assistant message + clear the lock.
        const assistantMsg = makeAssistantMessage(reply)
        if (ruleConflictNotes.length > 0) {
          assistantMsg.content = `${assistantMsg.content}\n\n${ruleConflictNotes.join("\n")}`
        }
        await appendMessage(input.sessionId, ctx.user.id, assistantMsg)
        await endTurn(input.sessionId, ctx.user.id)

        const fresh = await getImportSessionById(input.sessionId, ctx.user.id)
        return {
          reply,
          messages: Array.isArray(fresh?.messages) ? fresh.messages : [],
          candidates: Array.isArray(fresh?.data) ? (fresh.data as unknown[]) : [],
          ruleConflictNotes,
        }
      } catch (err: unknown) {
        // Persist a failure marker so the UI can offer Retry, then release lock.
        const errorText = err instanceof Error ? err.message : "unknown wizard error"
        const failureMsg = makeFailureMessage(errorText)
        await appendMessage(input.sessionId, ctx.user.id, failureMsg)
        await endTurn(input.sessionId, ctx.user.id)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorText })
      }
    }),

  retryTurn: authedProcedure
    .input(z.object({ sessionId: z.string(), locale: z.string().optional() }))
    .output(wizardSendTurnOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "session not found" })

      const messages = Array.isArray(session.messages) ? session.messages : []
      const lastUser = [...messages].reverse().find((m) => m.role === "user")
      if (!lastUser) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "no user message to retry" })
      }

      // Force-clear any stale pending lock then re-acquire.
      await stealLockModel(input.sessionId, ctx.user.id)
      const claimed = await beginTurn(input.sessionId, ctx.user.id)
      if (!claimed) {
        throw new TRPCError({ code: "CONFLICT", message: "TURN_IN_PROGRESS" })
      }

      try {
        const { reply, ruleConflictNotes } = await processWizardTurn({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          userMessage: lastUser.content,
          ...(input.locale !== undefined && { locale: input.locale }),
        })
        const assistantMsg = makeAssistantMessage(reply)
        if (ruleConflictNotes.length > 0) {
          assistantMsg.content = `${assistantMsg.content}\n\n${ruleConflictNotes.join("\n")}`
        }
        await appendMessage(input.sessionId, ctx.user.id, assistantMsg)
        await endTurn(input.sessionId, ctx.user.id)

        const fresh = await getImportSessionById(input.sessionId, ctx.user.id)
        return {
          reply,
          messages: Array.isArray(fresh?.messages) ? fresh.messages : [],
          candidates: Array.isArray(fresh?.data) ? (fresh.data as unknown[]) : [],
          ruleConflictNotes,
        }
      } catch (err: unknown) {
        await endTurn(input.sessionId, ctx.user.id)
        const errorText = err instanceof Error ? err.message : "unknown wizard retry error"
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorText })
      }
    }),

  stealLock: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await stealLockModel(input.sessionId, ctx.user.id)
      return { ok: true }
    }),

  abandonSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await abandonSessionModel(input.sessionId, ctx.user.id)
      return { ok: true }
    }),

  applyBulkAction: authedProcedure
    .input(z.object({ sessionId: z.string(), action: bulkActionSchema }))
    .output(
      z.object({
        updated: z.number(),
        candidates: z.array(z.unknown()),
        createdIncomeSourceId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "session not found" })
      const candidates = Array.isArray(session.data) ? (session.data as TransactionCandidate[]) : []

      // Upsert the income source first (if requested) so we can stamp its id onto
      // every matched candidate in the same loop.
      let incomeSourceId: string | null = null
      const srcPayload = input.action.apply.createIncomeSource
      if (srcPayload) {
        const source = await upsertIncomeSource(ctx.user.id, {
          kind: srcPayload.kind,
          name: srcPayload.name,
          ...(srcPayload.taxId ? { taxId: srcPayload.taxId } : {}),
        })
        incomeSourceId = source.id
      }

      let updated = 0
      const targets = input.action.affectedRowIndexes
      const targetSet = targets.length > 0 ? new Set(targets) : null
      for (const c of candidates) {
        if (targetSet) {
          if (!targetSet.has(c.rowIndex)) continue
        } else if (!matchesBulkRule(c, input.action.match)) {
          continue
        }
        if (c.ruleMatched) continue
        if (input.action.apply.categoryCode !== undefined && input.action.apply.categoryCode !== null) c.categoryCode = input.action.apply.categoryCode
        if (input.action.apply.projectCode !== undefined && input.action.apply.projectCode !== null) c.projectCode = input.action.apply.projectCode
        if (input.action.apply.type !== undefined && input.action.apply.type !== null) c.type = input.action.apply.type
        if (input.action.apply.status !== undefined && input.action.apply.status !== null) c.status = input.action.apply.status as TransactionReviewStatusValue
        if (incomeSourceId) c.incomeSourceId = incomeSourceId
        updated += 1
      }
      await updateImportSession(input.sessionId, ctx.user.id, { data: candidates })
      return { updated, candidates: candidates as unknown as unknown[], createdIncomeSourceId: incomeSourceId }
    }),

  listBusinessFacts: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(businessFactSchema))
    .query(async ({ ctx }) => {
      return listBusinessFacts(ctx.user.id)
    }),

  saveBusinessFact: authedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(128),
        value: businessFactValueSchema,
        source: z.enum(["wizard", "user", "inferred"]).default("user"),
      }),
    )
    .output(businessFactSchema)
    .mutation(async ({ ctx, input }) => {
      return upsertBusinessFact({
        userId: ctx.user.id,
        key: input.key,
        value: input.value,
        source: input.source,
      })
    }),

  deleteBusinessFact: authedProcedure
    .input(z.object({ key: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBusinessFact(ctx.user.id, input.key)
      return { ok: true }
    }),

  needsOnboarding: authedProcedure
    .input(z.object({}).optional())
    .output(z.object({ needsOnboarding: z.boolean() }))
    .query(async ({ ctx }) => {
      const has = await hasAnyBusinessFacts(ctx.user.id)
      return { needsOnboarding: !has }
    }),

  applyTransferLink: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      rowIndexA: z.number().int(),
      rowIndexB: z.number().int().nullable(),
      // User-picked counter-account for orphan transfers (rowIndexB === null).
      // Ignored when rowIndexB is set because paired legs derive counter
      // account from each other at commit time via the cross-populate sweep.
      counterAccountId: z.string().uuid().nullable().optional(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })

      // A shared UUID links both legs pre-commit. Orphans (rowIndexB null) get
      // null — a partner may show up later and adopt the same id via the
      // matcher, or the row simply stays an unlinked transfer.
      const sharedTransferId = input.rowIndexB !== null ? randomUUID() : null

      const deriveDirection = (priorType: string | null | undefined): "outgoing" | "incoming" => {
        if (priorType === "income") return "incoming"
        return "outgoing"
      }

      // Only materialize the orphan counter-account pick when there's truly no
      // partner row. For confirmed pairs, the cross-populate sweep at commit
      // time derives counter_account_id from the partner's account, so keep
      // the candidate field at null to avoid double-writes.
      const orphanCounterAccountId =
        input.rowIndexB === null ? input.counterAccountId ?? null : null

      const candidates = (session.data as TransactionCandidate[]).map((c) => {
        if (c.rowIndex !== input.rowIndexA && c.rowIndex !== input.rowIndexB) return c
        const nextExtra = { ...(c.extra ?? {}) }
        Reflect.deleteProperty(nextExtra, "proposedTransferLink")
        return {
          ...c,
          type: "transfer",
          status: "internal",
          extra: nextExtra,
          transferId: sharedTransferId,
          transferDirection: deriveDirection(c.type),
          counterAccountId: orphanCounterAccountId,
        } satisfies TransactionCandidate
      })

      await updateImportSession(input.sessionId, ctx.user.id, { data: candidates })
      return { ok: true }
    }),

  setCandidateSelected: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      rowIndex: z.number().int(),
      selected: z.boolean(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })
      const candidates = (session.data as TransactionCandidate[]).map((c) =>
        c.rowIndex === input.rowIndex ? { ...c, selected: input.selected } : c,
      )
      await updateImportSession(input.sessionId, ctx.user.id, { data: candidates })
      return { ok: true }
    }),

  /** Manual per-row candidate edits from the wizard panel. Lets the user
   *  override the AI's type / category / status / project / account pick
   *  before commit — each field is optional so the UI can patch one at a
   *  time. Null explicitly clears a field; omitting a field leaves it alone. */
  updateCandidate: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      rowIndex: z.number().int(),
      type: z.string().nullable().optional(),
      categoryCode: z.string().nullable().optional(),
      projectCode: z.string().nullable().optional(),
      status: z.enum([
        "needs_review",
        "business",
        "business_non_deductible",
        "personal_taxable",
        "personal_ignored",
        "internal",
      ]).nullable().optional(),
      accountId: z.string().nullable().optional(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })
      const candidates = (session.data as TransactionCandidate[]).map((c) => {
        if (c.rowIndex !== input.rowIndex) return c
        const patched: TransactionCandidate = { ...c }
        if ("type" in input) patched.type = input.type ?? null
        if ("categoryCode" in input) patched.categoryCode = input.categoryCode ?? null
        if ("projectCode" in input) patched.projectCode = input.projectCode ?? null
        if ("status" in input && input.status) patched.status = input.status
        if ("accountId" in input) patched.accountId = input.accountId ?? null
        return patched
      })
      await updateImportSession(input.sessionId, ctx.user.id, { data: candidates })
      return { ok: true }
    }),

  addContextFile: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      fileId: z.string().uuid(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })
      const current = readContextFileIds(session.contextFileIds)
      if (current.includes(input.fileId)) return { ok: true }
      await updateImportSession(input.sessionId, ctx.user.id, {
        contextFileIds: [...current, input.fileId],
      })
      return { ok: true }
    }),

  removeContextFile: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      fileId: z.string().uuid(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })
      const current = readContextFileIds(session.contextFileIds)
      const next = current.filter((id) => id !== input.fileId)
      await updateImportSession(input.sessionId, ctx.user.id, { contextFileIds: next })
      return { ok: true }
    }),

  dismissTransferLink: authedProcedure
    .input(z.object({
      sessionId: z.string(),
      rowIndexA: z.number().int(),
      rowIndexB: z.number().int().nullable(),
    }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getImportSessionById(input.sessionId, ctx.user.id)
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" })
      const candidates = (session.data as TransactionCandidate[]).map((c) => {
        if (c.rowIndex !== input.rowIndexA && c.rowIndex !== input.rowIndexB) return c
        const nextExtra = { ...(c.extra ?? {}) }
        Reflect.deleteProperty(nextExtra, "proposedTransferLink")
        return { ...c, extra: nextExtra } satisfies TransactionCandidate
      })
      await updateImportSession(input.sessionId, ctx.user.id, { data: candidates })
      return { ok: true }
    }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesBulkRule(
  c: TransactionCandidate,
  match: { field: "name" | "merchant" | "description"; type: "contains" | "exact" | "starts_with" | "regex"; value: string },
): boolean {
  const fieldValue =
    match.field === "merchant" ? c.merchant : match.field === "description" ? c.description : c.name
  if (!fieldValue) return false
  const haystack = fieldValue.toLowerCase()
  const needle = match.value.toLowerCase()
  switch (match.type) {
    case "exact":
      return haystack === needle
    case "starts_with":
      return haystack.startsWith(needle)
    case "regex":
      try {
        return new RegExp(match.value, "i").test(fieldValue)
      } catch {
        return false
      }
    case "contains":
    default:
      return haystack.includes(needle)
  }
}

/**
 * Narrow the jsonb `context_file_ids` column to `string[]`. Tolerant of the
 * DB returning `null`, an untyped array, or the default empty array.
 */
function readContextFileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string")
}

function formatTitleTimestamp(d: Date): string {
  const month = d.toLocaleString("en", { month: "short" })
  const day = String(d.getDate()).padStart(2, "0")
  const time = d.toTimeString().slice(0, 5)
  return `${month} ${day} ${time}`
}
