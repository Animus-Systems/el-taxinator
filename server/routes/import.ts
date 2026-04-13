/**
 * Fastify routes for AI import (CSV + PDF).
 *
 * These routes handle file uploads via @fastify/multipart and orchestrate the
 * AI-powered import pipeline (detect mapping → apply → categorize → session).
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"
import { parse } from "@fast-csv/parse"

import { getActiveEntityId } from "@/lib/entities"
import { getOrCreateSelfHostedUser } from "@/models/users"
import {
  createImportSession,
  getImportSessionById,
  updateImportSession,
  deleteImportSession,
} from "@/models/import-sessions"
import { createTransaction } from "@/models/transactions"
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
import type { AnalyzeAttachment } from "@/ai/attachments"

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

      const { fields, fileBuffer, fileName } = await parseMultipart(request as never)
      if (!fileBuffer) return reply.code(400).send({ success: false, error: "No file uploaded" })

      const accountId = fields.accountId || null

      // 1. Parse CSV
      const text = fileBuffer.toString("utf-8")
      const rows = await parseCSVText(text)

      if (rows.length < 2) {
        return reply.send({ success: false, error: "CSV file is empty or has no data rows" })
      }

      const headers = rows[0]
      const dataRows = rows.slice(1)

      // 2. Detect mapping via AI
      const mapping = await detectCSVMapping(headers, dataRows.slice(0, 5), user.id)

      // 3. Apply mapping to produce candidates
      const settings = await getSettings(user.id)
      const defaultCurrency = settings?.defaultCurrency || "EUR"
      const candidates = applyCSVMapping(headers, dataRows, mapping, defaultCurrency)

      // 4. Apply rules
      const rules = await getActiveRules(user.id)
      if (rules.length > 0) {
        applyRulesToCandidates(candidates, rules)
      }

      // 5. Create import session
      const session = await createImportSession(user.id, {
        accountId,
        fileName,
        fileType: "csv",
        rowCount: candidates.length,
        data: candidates,
        columnMapping: mapping,
        status: "pending",
      })

      if (!session) {
        return reply.send({ success: false, error: "Failed to create import session" })
      }

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

      const accountId = fields.accountId || null

      const base64 = fileBuffer.toString("base64")
      const attachments: AnalyzeAttachment[] = [{
        filename: fileName,
        contentType: mimeType,
        base64,
      }]

      const settings = await getSettings(user.id)
      const defaultCurrency = settings?.defaultCurrency || "EUR"

      const result = await extractPDFTransactions(attachments, user.id, defaultCurrency)

      // Apply rules
      const rules = await getActiveRules(user.id)
      if (rules.length > 0) {
        applyRulesToCandidates(result.candidates, rules)
      }

      // Suggest new categories
      const suggestedCategories = await suggestNewCategories(result.candidates, user.id)

      // Create session
      const session = await createImportSession(user.id, {
        accountId,
        fileName,
        fileType: "pdf",
        rowCount: result.candidates.length,
        data: result.candidates,
        suggestedCategories,
        status: "pending",
      })

      if (!session) {
        return reply.send({ success: false, error: "Failed to create import session" })
      }

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

  // ─── Categorize session ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/api/import/session/:id/categorize", async (request, reply) => {
    try {
      const user = await getUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const session = await getImportSessionById(request.params.id, user.id)
      if (!session) {
        return reply.send({ success: false, error: "Session not found" })
      }

      const candidates = session.data as TransactionCandidate[]

      // Run AI categorization
      await categorizeTransactions(candidates, user.id)

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
  app.post<{ Params: { id: string }; Body: { feedback: string } }>(
    "/api/import/session/:id/recategorize",
    async (request, reply) => {
      try {
        const user = await getUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const session = await getImportSessionById(request.params.id, user.id)
        if (!session) {
          return reply.send({ success: false, error: "Session not found" })
        }

        const candidates = session.data as TransactionCandidate[]
        const feedback = (request.body as { feedback?: string })?.feedback ?? ""

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
        acceptedCategories?: Array<{
          code: string
          name: { en: string; es: string }
          taxFormRef: string
        }>
      }

      const selectedIndexes = new Set(body.selectedRowIndexes ?? [])
      const candidates = (session.data as TransactionCandidate[]).filter(
        (c) => selectedIndexes.has(c.rowIndex),
      )

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
          await createTransaction(user.id, {
            name: c.name,
            merchant: c.merchant,
            description: c.description,
            total: c.total,
            currencyCode: c.currencyCode || "EUR",
            type: c.type || "expense",
            categoryCode: c.categoryCode,
            projectCode: c.projectCode,
            issuedAt: c.issuedAt ? new Date(c.issuedAt).toISOString() : null,
            accountId: session.accountId || null,
          })
          created++
        } catch (err) {
          console.error(`[import/commit] Failed to create transaction row ${c.rowIndex}:`, err)
        }
      }

      // Mark session as committed
      await updateImportSession(request.params.id, user.id, { status: "committed" })

      return reply.send({ success: true, created })
    } catch (error) {
      console.error("[import/commit] Error:", error)
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : "Commit failed",
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
