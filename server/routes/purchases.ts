/**
 * Fastify routes for purchases:
 *
 * GET  /api/purchases/libro?year=2025[&quarter=2]
 *   Returns a single PDF listing every non-cancelled purchase in the
 *   period (libro de facturas recibidas).
 *
 * POST /api/purchases/extract
 *   Accepts a PDF / CSV / XLSX / image multipart upload. Runs the LLM to
 *   pull out a list of purchase records (works for registers, single
 *   invoices, and receipts) and returns them to the client WITHOUT saving.
 *   The /purchases page shows a review table; committing happens via
 *   `trpc.purchases.bulkCreate`.
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"
import { getOrCreateSelfHostedUser } from "@/models/users"
import { getPurchases } from "@/models/purchases"
import { persistUploadedFile } from "@/models/files"
import { getActiveEntityId } from "@/lib/entities"
import { renderLibroRecibidasPdfBuffer } from "@/components/purchases/libro-pdf"
import { extractPurchasesFromFile } from "@/ai/extract-purchases"
import type { ExtractedPurchase } from "@/ai/extract-purchases"

type UploadedPart = {
  filename: string
  mimetype: string
  buffer: Buffer
}

async function parsePurchaseImportMultipart(request: unknown): Promise<UploadedPart | null> {
  const parts = (request as {
    parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart>
  }).parts()
  for await (const part of parts) {
    if (part.type !== "file") continue
    const buffer = await part.toBuffer()
    return {
      filename: part.filename,
      mimetype: part.mimetype || "application/octet-stream",
      buffer,
    }
  }
  return null
}

function periodForYear(year: number, quarter?: number): { start: string; end: string } {
  if (quarter && quarter >= 1 && quarter <= 4) {
    const startMonth = (quarter - 1) * 3
    const start = new Date(Date.UTC(year, startMonth, 1))
    const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59))
    return { start: start.toISOString(), end: end.toISOString() }
  }
  return {
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
  }
}

export async function purchasesRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })
  }

  app.post("/api/purchases/extract", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const part = await parsePurchaseImportMultipart(request)
      if (!part) {
        return reply.code(400).send({ success: false, error: "A file is required" })
      }

      let purchases: ExtractedPurchase[]
      try {
        purchases = await extractPurchasesFromFile(user.id, part)
      } catch (err) {
        console.error("[purchases/extract] extraction failed:", err)
        return reply.code(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Extraction failed",
        })
      }

      // Persist the uploaded file so the client can later attach it to an
      // existing purchase if the extraction lines up as a duplicate. Marked
      // isReviewed=true since the user explicitly brought it in — not a raw
      // inbox drop.
      const entityId = await getActiveEntityId()
      const persisted = await persistUploadedFile(user.id, entityId, {
        fileName: part.filename,
        mimetype: part.mimetype,
        buffer: part.buffer,
        isReviewed: true,
      })

      return reply.send({
        success: true,
        filename: part.filename,
        fileId: persisted.id,
        purchases,
      })
    } catch (error) {
      console.error("[purchases/extract] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })

  app.get("/api/purchases/libro", async (request, reply) => {
    const user = await getOrCreateSelfHostedUser()
    if (!user) return reply.code(401).send({ error: "Not authenticated" })

    const q = request.query as { year?: string; quarter?: string }
    const year = Number.parseInt(q.year ?? "", 10)
    const quarter = q.quarter ? Number.parseInt(q.quarter, 10) : undefined
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return reply.code(400).send({ error: "Invalid year" })
    }

    const { start, end } = periodForYear(year, quarter)
    const allPurchases = await getPurchases(user.id, { dateFrom: start, dateTo: end })
    const purchases = allPurchases.filter((p) => p.status !== "cancelled")
    purchases.sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime())

    const buffer = await renderLibroRecibidasPdfBuffer(purchases, {
      year,
      ...(quarter !== undefined ? { quarter } : {}),
    })

    const filename = quarter
      ? `libro-recibidas-${year}-Q${quarter}.pdf`
      : `libro-recibidas-${year}.pdf`
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer)
  })
}
