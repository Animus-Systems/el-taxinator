/**
 * Fastify routes for AI import (CSV + PDF).
 *
 * These routes handle file uploads via @fastify/multipart and orchestrate the
 * AI-powered import pipeline (detect mapping → apply → categorize → session).
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"
import { parse } from "@fast-csv/parse"

import { getOrCreateSelfHostedUser } from "@/models/users"
import {
  createImportSession,
  getImportSessionById,
  updateImportSession,
  deleteImportSession,
  appendMessage,
} from "@/models/import-sessions"
import type { WizardMessage } from "@/lib/db-types"
import { randomUUID } from "node:crypto"
import { buildSessionReport } from "@/ai/session-report"
import { renderWizardSessionReportPdf } from "@/components/wizard/wizard-report-pdf"
import { createTransaction } from "@/models/transactions"
import { syncCryptoLedger } from "@/lib/crypto-hooks"
import { createCategory } from "@/models/categories"
import { getSettings } from "@/models/settings"
import {
  detectCSVMapping,
  applyCSVMapping,
  categorizeTransactions,
  categorizeTransactionsWithFeedback,
} from "@/ai/import-csv"
import type { TransactionCandidate } from "@/ai/import-csv"
import { suggestNewCategories } from "@/ai/suggest-categories"
import { detectPDFType, extractPDFTransactions } from "@/ai/import-pdf"
import { applyRulesToCandidates } from "@/models/rules"
import { getActiveRules } from "@/models/rules"
import { learnFromImport } from "@/ai/learn-rules"
import { getActiveAccounts } from "@/models/accounts"
import { persistUploadedFile } from "@/models/files"
import { getActiveEntityId } from "@/lib/entities"
import type { BankAccount } from "@/lib/db-types"
import type { AnalyzeAttachment } from "@/ai/attachments"
import { validateImportCommit } from "@/lib/import-review"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUser() {
  return getOrCreateSelfHostedUser()
}

/** Parse all multipart parts (fields + file) regardless of order. */
async function parseMultipart(request: { parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart> }) {
  const fields: Record<string, string> = {}
  let fileBuffer: Buffer | null = null
  let fileName = ""
  let mimeType = ""

  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer()
      fileName = part.filename
      mimeType = part.mimetype
    } else {
      fields[part.fieldname] = part.value as string
    }
  }

  return { fields, fileBuffer, fileName, mimeType }
}

function parseCSVText(text: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const rows: string[][] = []
    const parser = parse()
      .on("data", (row: string[]) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve(rows))
    parser.write(text)
    parser.end()
  })
}

function applySelectionToCandidates(
  candidates: TransactionCandidate[],
  selectedIndexes: Set<number>,
): TransactionCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    selected: selectedIndexes.has(candidate.rowIndex),
  }))
}

export type AccountMatchResult =
  | { kind: "single"; account: BankAccount }
  | { kind: "none"; accounts: BankAccount[] }
  | { kind: "ambiguous"; candidates: BankAccount[] }

/**
 * Map a bank name detected from the uploaded file to one of the user's bank
 * accounts. Match against `bankName` first (most specific), then fall back to
 * account `name`. Case-insensitive substring matching handles "N26" vs
 * "N26 Bank" and "BBVA" vs "BBVA Main".
 */
export function matchAccountByBank(bank: string | null, accounts: BankAccount[]): AccountMatchResult {
  if (!bank || accounts.length === 0) return { kind: "none", accounts }
  const needle = bank.toLowerCase()
  const byBankName = accounts.filter((a) => a.bankName && a.bankName.toLowerCase().includes(needle))
  if (byBankName.length === 1 && byBankName[0]) return { kind: "single", account: byBankName[0] }
  if (byBankName.length > 1) return { kind: "ambiguous", candidates: byBankName }

  const byName = accounts.filter((a) => a.name.toLowerCase().includes(needle))
  if (byName.length === 1 && byName[0]) return { kind: "single", account: byName[0] }
  if (byName.length > 1) return { kind: "ambiguous", candidates: byName }

  return { kind: "none", accounts }
}

/**
 * Seed the first assistant message for a freshly uploaded file so the wizard
 * chat opens with a natural-language summary instead of a blank panel.
 */
async function seedUploadOpeningMessage(
  sessionId: string,
  userId: string,
  opts: {
    kind: "csv" | "pdf"
    fileName: string
    bank: string | null
    candidates: TransactionCandidate[]
    accountMatch: AccountMatchResult
  },
): Promise<void> {
  const total = opts.candidates.length
  const needsReview = opts.candidates.filter(
    (c) => !c.status || c.status === "needs_review",
  ).length
  const resolved = total - needsReview
  const kindLabel = opts.kind === "csv" ? "CSV" : "PDF"
  const bankPart = opts.bank ? ` from ${opts.bank}` : ""

  const openingSummary =
    total === 0
      ? `I read "${opts.fileName}" but didn't find any transactions. You can drop a different file or describe a transaction manually.`
      : resolved > 0
        ? `I read ${total} transactions${bankPart} in that ${kindLabel}. ${resolved} look clear from your existing rules; ${needsReview} need your eye.`
        : `I read ${total} transactions${bankPart} in that ${kindLabel}. None matched an existing rule yet.`

  let accountNote = ""
  if (opts.accountMatch.kind === "single") {
    accountNote = ` I've assigned them to your **${opts.accountMatch.account.name}** account — let me know if that's wrong.`
  } else if (opts.accountMatch.kind === "ambiguous") {
    const names = opts.accountMatch.candidates.map((a) => a.name).join(", ")
    accountNote = ` I see multiple accounts that could match${opts.bank ? ` "${opts.bank}"` : ""} (${names}) — which one should I use?`
  } else if (opts.bank && opts.accountMatch.accounts.length > 0) {
    const names = opts.accountMatch.accounts.map((a) => a.name).join(", ")
    accountNote = ` I didn't find a bank account matching "${opts.bank}". Should I use one of your existing accounts (${names}) or create a new one?`
  }

  const question =
    total > 0
      ? " Want me to walk through the ambiguous rows, or should I run categorization on all of them first?"
      : ""

  const message: WizardMessage = {
    id: randomUUID(),
    role: "assistant",
    content: `${openingSummary}${accountNote}${question}`,
    createdAt: new Date().toISOString(),
  }
  await appendMessage(sessionId, userId, message)
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function importRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  // ─── CSV import ──────────────────────────────────────────────────────
  app.post("/api/import/csv", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const { fields, fileBuffer, fileName, mimeType } = await parseMultipart(request as never)
      if (!fileBuffer) return reply.code(400).send({ success: false, error: "No file uploaded" })

      const accountId = fields["accountId"] || null

      // 0. Persist the raw CSV to disk so it shows up in /files and survives
      //    beyond this request. Reviewed=true — the wizard owns the review.
      const entityId = await getActiveEntityId()
      const persistedFile = await persistUploadedFile(user.id, entityId, {
        fileName,
        mimetype: mimeType || "text/csv",
        buffer: fileBuffer,
        isReviewed: true,
      })

      // 1. Parse CSV
      const text = fileBuffer.toString("utf-8")
      const rows = await parseCSVText(text)

      const headers = rows[0]
      if (!headers || rows.length < 2) {
        return reply.send({ success: false, error: "CSV file is empty or has no data rows" })
      }

      const dataRows = rows.slice(1)

      // 2. Detect mapping via AI
      const mapping = await detectCSVMapping(headers, dataRows.slice(0, 5), user.id)

      // 3. Apply mapping to produce candidates
      const settings = await getSettings(user.id)
      const defaultCurrency = settings?.["defaultCurrency"] || "EUR"
      const candidates = applyCSVMapping(headers, dataRows, mapping, defaultCurrency)

      // 4. Apply rules
      const rules = await getActiveRules(user.id)
      if (rules.length > 0) {
        applyRulesToCandidates(candidates, rules)
      }

      // 4b. Match uploaded bank to an existing account. If exactly one matches
      //     and the user didn't pre-select, pre-assign it to the whole file.
      const userAccounts = await getActiveAccounts(user.id)
      const accountMatch = matchAccountByBank(mapping.bank ?? null, userAccounts)
      let resolvedAccountId: string | null = accountId
      if (!resolvedAccountId && accountMatch.kind === "single") {
        resolvedAccountId = accountMatch.account.id
      }
      if (resolvedAccountId) {
        for (const c of candidates) {
          if (c.accountId == null) c.accountId = resolvedAccountId
        }
      }

      // 5. Create import session
      const session = await createImportSession(user.id, {
        accountId: resolvedAccountId,
        fileId: persistedFile.id,
        fileName,
        fileType: "csv",
        rowCount: candidates.length,
        data: candidates,
        columnMapping: mapping,
        status: "pending",
        entryMode: "csv",
        title: fileName,
      })

      if (!session) {
        return reply.send({ success: false, error: "Failed to create import session" })
      }

      // 6. Seed the wizard's opening assistant message so the chat isn't blank.
      await seedUploadOpeningMessage(session.id, user.id, {
        kind: "csv",
        fileName,
        bank: mapping.bank ?? null,
        candidates,
        accountMatch,
      })

      return reply.send({
        success: true,
        sessionId: session.id,
        bank: mapping.bank,
        bankConfidence: mapping.bankConfidence,
      })
    } catch (error) {
      console.error("[import/csv] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "CSV import failed",
      })
    }
  })

  // ─── PDF detect type ─────────────────────────────────────────────────
  app.post("/api/import/pdf/detect", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const { fileBuffer, fileName, mimeType } = await parseMultipart(request as never)
      if (!fileBuffer) return reply.code(400).send({ success: false, error: "No file uploaded" })

      const base64 = fileBuffer.toString("base64")
      const attachments: AnalyzeAttachment[] = [{
        filename: fileName,
        contentType: mimeType,
        base64,
      }]

      const pdfType = await detectPDFType(attachments, user.id)

      return reply.send({ success: true, type: pdfType })
    } catch (error) {
      console.error("[import/pdf/detect] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "PDF detection failed",
      })
    }
  })

  // ─── PDF extract transactions ────────────────────────────────────────
  app.post("/api/import/pdf/extract", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const { fields, fileBuffer, fileName, mimeType } = await parseMultipart(request as never)
      if (!fileBuffer) return reply.code(400).send({ success: false, error: "No file uploaded" })

      const accountId = fields["accountId"] || null

      // Persist the raw PDF to disk so it lives in /files and doesn't vanish
      // when the request ends. Reviewed=true — the wizard owns the review.
      const entityId = await getActiveEntityId()
      const persistedFile = await persistUploadedFile(user.id, entityId, {
        fileName,
        mimetype: mimeType || "application/pdf",
        buffer: fileBuffer,
        isReviewed: true,
      })

      const base64 = fileBuffer.toString("base64")
      const attachments: AnalyzeAttachment[] = [{
        filename: fileName,
        contentType: mimeType,
        base64,
      }]

      const settings = await getSettings(user.id)
      const defaultCurrency = settings?.["defaultCurrency"] || "EUR"

      const result = await extractPDFTransactions(attachments, user.id, defaultCurrency)

      // Apply rules
      const rules = await getActiveRules(user.id)
      if (rules.length > 0) {
        applyRulesToCandidates(result.candidates, rules)
      }

      // Match detected bank to an existing account.
      const userAccounts = await getActiveAccounts(user.id)
      const accountMatch = matchAccountByBank(result.bank ?? null, userAccounts)
      let resolvedAccountId: string | null = accountId
      if (!resolvedAccountId && accountMatch.kind === "single") {
        resolvedAccountId = accountMatch.account.id
      }
      if (resolvedAccountId) {
        for (const c of result.candidates) {
          if (c.accountId == null) c.accountId = resolvedAccountId
        }
      }

      // Suggest new categories
      const suggestedCategories = await suggestNewCategories(result.candidates, user.id)

      // Create session
      const session = await createImportSession(user.id, {
        accountId: resolvedAccountId,
        fileId: persistedFile.id,
        fileName,
        fileType: "pdf",
        rowCount: result.candidates.length,
        data: result.candidates,
        suggestedCategories,
        status: "pending",
        entryMode: "pdf",
        title: fileName,
      })

      if (!session) {
        return reply.send({ success: false, error: "Failed to create import session" })
      }

      // Seed the wizard's opening assistant message.
      await seedUploadOpeningMessage(session.id, user.id, {
        kind: "pdf",
        fileName,
        bank: result.bank ?? null,
        candidates: result.candidates,
        accountMatch,
      })

      return reply.send({
        success: true,
        sessionId: session.id,
        bank: result.bank,
        bankConfidence: result.bankConfidence,
      })
    } catch (error) {
      console.error("[import/pdf/extract] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "PDF extraction failed",
      })
    }
  })

  // ─── Get session ─────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/api/import/session/:id", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const session = await getImportSessionById(request.params.id, user.id)
      if (!session) {
        return reply.send({ success: false, error: "Session not found" })
      }

      return reply.send({
        success: true,
        session: {
          data: session.data,
          suggestedCategories: session.suggestedCategories || [],
        },
      })
    } catch (error) {
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Failed to load session",
      })
    }
  })

  // ─── Persist reviewed session rows ──────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { reviewedCandidates: TransactionCandidate[] }
  }>("/api/import/session/:id/review", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const session = await getImportSessionById(request.params.id, user.id)
      if (!session) {
        return reply.send({ success: false, error: "Session not found" })
      }

      const body = request.body as { reviewedCandidates?: TransactionCandidate[] } | undefined
      const reviewedCandidates = body?.reviewedCandidates
      if (!Array.isArray(reviewedCandidates)) {
        return reply.code(400).send({ success: false, error: "Missing reviewed candidates" })
      }

      await updateImportSession(request.params.id, user.id, {
        data: reviewedCandidates,
      })

      return reply.send({ success: true })
    } catch (error) {
      console.error("[import/review] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Failed to save review",
      })
    }
  })

  // ─── Categorize session ──────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { reviewedCandidates?: TransactionCandidate[] }
  }>("/api/import/session/:id/categorize", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const session = await getImportSessionById(request.params.id, user.id)
      if (!session) {
        return reply.send({ success: false, error: "Session not found" })
      }

      const body = request.body as { reviewedCandidates?: TransactionCandidate[] } | undefined
      const candidates = body?.reviewedCandidates ?? (session.data as TransactionCandidate[])

      // Run AI categorization
      await categorizeTransactions(candidates, user.id)

      // Snapshot AI's first-pass suggestions so we can learn from the user's
      // later corrections at commit time. Only set if not already captured
      // (recategorize calls keep the original snapshot).
      for (const candidate of candidates) {
        if (candidate.suggestedCategoryCode === undefined) {
          candidate.suggestedCategoryCode = candidate.categoryCode
        }
        if (candidate.suggestedProjectCode === undefined) {
          candidate.suggestedProjectCode = candidate.projectCode
        }
        if (candidate.suggestedType === undefined) {
          candidate.suggestedType = candidate.type
        }
      }

      // Suggest new categories
      const suggestedCategories = await suggestNewCategories(candidates, user.id)

      // Update session
      await updateImportSession(request.params.id, user.id, {
        data: candidates,
        suggestedCategories,
      })

      return reply.send({ success: true })
    } catch (error) {
      console.error("[import/categorize] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Categorization failed",
      })
    }
  })

  // ─── Recategorize with feedback ──────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { feedback: string; reviewedCandidates?: TransactionCandidate[] } }>(
    "/api/import/session/:id/recategorize",
    async (request, reply) => {
      try {
        const user = await getUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const session = await getImportSessionById(request.params.id, user.id)
        if (!session) {
          return reply.send({ success: false, error: "Session not found" })
        }

        const body = request.body as { feedback?: string; reviewedCandidates?: TransactionCandidate[] } | undefined
        const candidates = body?.reviewedCandidates ?? (session.data as TransactionCandidate[])
        const feedback = body?.feedback ?? ""

        await categorizeTransactionsWithFeedback(candidates, user.id, feedback)
        const suggestedCategories = await suggestNewCategories(candidates, user.id)

        await updateImportSession(request.params.id, user.id, {
          data: candidates,
          suggestedCategories,
        })

        return reply.send({ success: true })
      } catch (error) {
        console.error("[import/recategorize] Error:", error)
        return reply.send({
          success: false,
          error: error instanceof Error ? error.message : "Recategorization failed",
        })
      }
    },
  )

  // ─── Commit import ───────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      selectedRowIndexes: number[]
      reviewedCandidates?: TransactionCandidate[]
      acceptedCategories?: Array<{
        code: string
        name: { en: string; es: string }
        taxFormRef: string
        reason: string
      }>
    }
  }>("/api/import/session/:id/commit", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const session = await getImportSessionById(request.params.id, user.id)
      if (!session) {
        return reply.send({ success: false, error: "Session not found" })
      }

      const body = request.body as {
        selectedRowIndexes?: number[]
        reviewedCandidates?: TransactionCandidate[]
        acceptedCategories?: Array<{
          code: string
          name: { en: string; es: string }
          taxFormRef: string
        }>
      }

      const selectedIndexes = new Set(body.selectedRowIndexes ?? [])
      const reviewedCandidates = applySelectionToCandidates(
        body.reviewedCandidates ?? (session.data as TransactionCandidate[]),
        selectedIndexes,
      )
      const validation = validateImportCommit(reviewedCandidates)
      if (!validation.ok) {
        return reply.code(400).send({
          success: false,
          error: "Review incomplete",
          validationErrors: validation.errors,
        })
      }

      await updateImportSession(request.params.id, user.id, {
        data: reviewedCandidates,
      })

      const candidates = reviewedCandidates.filter((candidate) => candidate.selected)

      // Create accepted categories first
      if (body.acceptedCategories && body.acceptedCategories.length > 0) {
        for (const cat of body.acceptedCategories) {
          try {
            await createCategory(user.id, {
              code: cat.code,
              name: cat.name,
              color: "#6b7280",
              taxFormRef: cat.taxFormRef || null,
              isDefault: false,
            })
          } catch {
            // Category might already exist, skip
          }
        }
      }

      // Create transactions
      let created = 0
      for (const c of candidates) {
        try {
          const extraPayload = c.extra as Record<string, unknown> | undefined
          const tx = await createTransaction(user.id, {
            name: c.name,
            merchant: c.merchant,
            description: c.description,
            total: c.total,
            currencyCode: c.currencyCode || "EUR",
            type: c.type || "expense",
            categoryCode: c.categoryCode,
            projectCode: c.projectCode,
            issuedAt: c.issuedAt ? new Date(c.issuedAt).toISOString() : null,
            accountId: c.accountId || session.accountId || null,
            status: c.status,
            // Carry the wizard's extra payload (crypto meta, etc.) through to
            // transactions.extra so /crypto-page queries can find it.
            ...(extraPayload ? { extra: extraPayload } : {}),
          })

          // Hook crypto-tagged transactions into the FIFO ledger so holdings
          // and realised gains stay in sync with committed transactions.
          await syncCryptoLedger(user.id, tx, c)

          created++
        } catch (err) {
          console.error(`[import/commit] Failed to create transaction row ${c.rowIndex}:`, err)
        }
      }

      // Mark session as committed
      await updateImportSession(request.params.id, user.id, { status: "committed" })

      // Learn from the user's corrections — if they consistently re-
      // categorized several transactions the same way, turn that into a
      // "learned" rule that will pre-match similar rows on the next import.
      let rulesLearned = 0
      try {
        const originalSuggestions = reviewedCandidates
          .filter((c) => c.suggestedCategoryCode !== undefined || c.suggestedProjectCode !== undefined || c.suggestedType !== undefined)
          .map((c) => ({
            rowIndex: c.rowIndex,
            categoryCode: c.suggestedCategoryCode ?? null,
            projectCode: c.suggestedProjectCode ?? null,
            type: c.suggestedType ?? null,
          }))
        if (originalSuggestions.length > 0) {
          rulesLearned = await learnFromImport(user.id, originalSuggestions, candidates)
        }
      } catch (err) {
        // Learning is best-effort; never fail a commit over it.
        console.error("[import/commit] learnFromImport failed:", err)
      }

      return reply.send({ success: true, created, rulesLearned })
    } catch (error) {
      console.error("[import/commit] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Commit failed",
      })
    }
  })

  // ─── Session PDF report (post-commit downloadable) ───────────────────
  app.get<{ Params: { id: string } }>("/api/wizard/session/:id/report.pdf", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const report = await buildSessionReport(request.params.id, user.id)
      const buffer = await renderWizardSessionReportPdf(report)

      reply.header("Content-Type", "application/pdf")
      reply.header("Content-Length", String(buffer.length))
      reply.header(
        "Content-Disposition",
        `attachment; filename="taxinator-session-${request.params.id}.pdf"`,
      )
      return reply.send(buffer)
    } catch (error) {
      console.error("[wizard/report] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate report",
      })
    }
  })

  // ─── Cancel import ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/api/import/session/:id", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      await deleteImportSession(request.params.id, user.id)
      return reply.send({ success: true })
    } catch (error) {
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Cancel failed",
      })
    }
  })
}
