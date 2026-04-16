/**
 * Fastify routes for personal-tax data entry (payslip upload, etc).
 *
 * POST /api/personal/payslip/upload
 *   Multipart: one payslip PDF or image. AI extracts employer + amounts +
 *   period; the server upserts an `income_sources` row (kind=salary), inserts
 *   a `transactions` row tagged `status=personal_income`, and returns
 *   `{ incomeSourceId, transactionId, extracted }`.
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getActiveEntityId } from "@/lib/entities"
import { persistUploadedFile } from "@/models/files"
import { upsertIncomeSource } from "@/models/income-sources"
import { createTransaction } from "@/models/transactions"
import { extractPayslipFromFile } from "@/ai/extract-payslip"
import type { ExtractedPayslip } from "@/ai/extract-payslip"
import type { AnalyzeAttachment } from "@/ai/attachments"

type ParsedMultipart = {
  fileBuffer: Buffer | null
  fileName: string | null
  mimetype: string
}

async function parseSingleFile(request: unknown): Promise<ParsedMultipart> {
  const parts = (request as {
    parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart>
  }).parts()
  let fileBuffer: Buffer | null = null
  let fileName: string | null = null
  let mimetype = "application/pdf"
  for await (const part of parts) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer()
      fileName = part.filename
      mimetype = part.mimetype || mimetype
    }
  }
  return { fileBuffer, fileName, mimetype }
}

export async function personalRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  }

  app.post("/api/personal/payslip/upload", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const entityId = await getActiveEntityId()
      const { fileBuffer, fileName, mimetype } = await parseSingleFile(request)

      if (!fileBuffer || !fileName) {
        return reply.code(400).send({ success: false, error: "Payslip file is required" })
      }

      const persistedFile = await persistUploadedFile(user.id, entityId, {
        fileName,
        mimetype,
        buffer: fileBuffer,
        isReviewed: true,
      })

      const attachments: AnalyzeAttachment[] = [
        { filename: fileName, contentType: mimetype, base64: fileBuffer.toString("base64") },
      ]

      let extracted: ExtractedPayslip
      try {
        extracted = await extractPayslipFromFile(attachments, user.id)
      } catch (err) {
        console.error("[personal/payslip] extract failed", err)
        return reply.code(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Extraction failed",
        })
      }

      if (!extracted.employerName) {
        return reply.send({
          success: true,
          needsReview: true,
          fileId: persistedFile.id,
          extracted,
        })
      }

      const incomeSource = await upsertIncomeSource(user.id, {
        kind: "salary",
        name: extracted.employerName,
        taxId: extracted.employerTaxId ?? null,
      })

      const grossCents = extracted.gross != null ? Math.round(extracted.gross * 100) : null
      const netCents = extracted.net != null ? Math.round(extracted.net * 100) : null
      const irpfWithheldCents = extracted.irpfWithheld != null
        ? Math.round(extracted.irpfWithheld * 100)
        : null
      const ssEmployeeCents = extracted.ssEmployee != null
        ? Math.round(extracted.ssEmployee * 100)
        : null

      const issuedAt = extracted.periodEnd
        ? new Date(extracted.periodEnd)
        : extracted.periodStart
          ? new Date(extracted.periodStart)
          : new Date()

      const txName = extracted.periodStart && extracted.periodEnd
        ? `Nómina ${extracted.periodStart} → ${extracted.periodEnd}`
        : `Nómina ${extracted.employerName}`

      const tx = await createTransaction(user.id, {
        name: txName,
        merchant: extracted.employerName,
        total: netCents ?? grossCents ?? 0,
        currencyCode: extracted.currency ?? "EUR",
        type: "income",
        status: "personal_income",
        issuedAt,
        files: [persistedFile.id],
        incomeSourceId: incomeSource.id,
        extra: {
          payslip: {
            grossCents,
            netCents,
            irpfWithheldCents,
            ssEmployeeCents,
            periodStart: extracted.periodStart,
            periodEnd: extracted.periodEnd,
            confidence: extracted.confidence,
          },
        },
      })

      return reply.send({
        success: true,
        incomeSourceId: incomeSource.id,
        transactionId: tx.id,
        fileId: persistedFile.id,
        extracted,
      })
    } catch (error) {
      console.error("[personal/payslip] error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })
}
