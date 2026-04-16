/**
 * Fastify routes for vendor receipts / supplier invoices.
 *
 * POST /api/receipts/upload
 *   Accepts one or more PDF / image files in a single multipart request.
 *   For each: persists the bytes, runs the LLM to pull out vendor+total+date,
 *   stores the extracted fields in `files.metadata.extracted`, and returns
 *   `[{ fileId, filename, extracted }]` to the client for review.
 *   Files land as `is_reviewed = false` so they show up in the Inbox until
 *   the user commits a match (or orphans them).
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getActiveEntityId } from "@/lib/entities"
import { persistUploadedFile, updateFile } from "@/models/files"
import { extractReceiptFromFile } from "@/ai/extract-receipt"
import type { ExtractedReceipt } from "@/ai/extract-receipt"
import type { AnalyzeAttachment } from "@/ai/attachments"

type UploadedPart = {
  filename: string
  mimetype: string
  buffer: Buffer
}

async function parseReceiptMultipart(request: unknown): Promise<UploadedPart[]> {
  const parts = (request as {
    parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart>
  }).parts()

  const uploaded: UploadedPart[] = []
  for await (const part of parts) {
    if (part.type !== "file") continue
    const buffer = await part.toBuffer()
    uploaded.push({
      filename: part.filename,
      mimetype: part.mimetype || "application/octet-stream",
      buffer,
    })
  }
  return uploaded
}

export async function receiptsRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 20 } })
  }

  app.post("/api/receipts/upload", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const entityId = await getActiveEntityId()
      const uploaded = await parseReceiptMultipart(request)

      if (uploaded.length === 0) {
        return reply.code(400).send({ success: false, error: "At least one file is required" })
      }

      const results: Array<{
        fileId: string
        filename: string
        mimetype: string
        extracted: ExtractedReceipt
      }> = []

      for (const part of uploaded) {
        const persisted = await persistUploadedFile(user.id, entityId, {
          fileName: part.filename,
          mimetype: part.mimetype,
          buffer: part.buffer,
          isReviewed: false,
        })

        const attachments: AnalyzeAttachment[] = [
          {
            filename: part.filename,
            contentType: part.mimetype,
            base64: part.buffer.toString("base64"),
          },
        ]

        let extracted: ExtractedReceipt
        try {
          extracted = await extractReceiptFromFile(attachments, user.id)
        } catch (err) {
          console.error("[receipts/upload] extract failed for", part.filename, err)
          extracted = {
            vendor: null,
            vendorTaxId: null,
            total: null,
            vatRate: null,
            issueDate: null,
            currency: null,
            paymentMethod: null,
            notes: null,
            confidence: 0,
          }
        }

        await updateFile(persisted.id, user.id, {
          metadata: {
            size: part.buffer.length,
            extracted: {
              vendor: extracted.vendor,
              vendorTaxId: extracted.vendorTaxId,
              total: extracted.total,
              vatRate: extracted.vatRate,
              issueDate: extracted.issueDate,
              currency: extracted.currency,
              paymentMethod: extracted.paymentMethod,
              notes: extracted.notes,
              confidence: extracted.confidence,
            },
          },
        })

        results.push({
          fileId: persisted.id,
          filename: persisted.filename,
          mimetype: persisted.mimetype,
          extracted,
        })
      }

      return reply.send({ success: true, receipts: results })
    } catch (error) {
      console.error("[receipts/upload] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })
}
