/**
 * Fastify routes for externally-generated invoices.
 *
 * POST /api/invoices/extract
 *   Uploads a PDF / image, persists the bytes, runs the LLM to pull out
 *   invoice fields, and returns both the new `fileId` and the extracted
 *   suggestions. The client then renders an editable review form.
 *
 * POST /api/invoices/upload-external
 *   Creates the `invoices` row once the user confirms. Accepts either
 *   `fileId` (referring to a file persisted by /extract) or a new `file`
 *   part for the manual path.
 */
import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getActiveEntityId } from "@/lib/entities"
import { persistUploadedFile, getFileById } from "@/models/files"
import { createInvoice, setInvoicePdfFileId, getInvoiceById } from "@/models/invoices"
import { extractInvoiceFromPDF } from "@/ai/extract-invoice"
import { renderInvoicePdfBuffer } from "@/components/invoicing/invoice-pdf"
import type { AnalyzeAttachment } from "@/ai/attachments"

type Fields = {
  number?: string
  issueDate?: string
  dueDate?: string
  contactId?: string
  fileId?: string
  status?: string
  notes?: string
  total?: string
  vatRate?: string
  currencyCode?: string
}

type ParsedMultipart = {
  fields: Fields
  fileBuffer: Buffer | null
  fileName: string | null
  mimetype: string
}

async function parseMultipart(request: unknown): Promise<ParsedMultipart> {
  const fields: Fields = {}
  let fileBuffer: Buffer | null = null
  let fileName: string | null = null
  let mimetype = "application/pdf"

  const parts = (request as {
    parts(): AsyncIterableIterator<import("@fastify/multipart").Multipart>
  }).parts()

  for await (const part of parts) {
    if (part.type === "file") {
      fileBuffer = await part.toBuffer()
      fileName = part.filename
      mimetype = part.mimetype || mimetype
    } else {
      const key = part.fieldname as keyof Fields
      fields[key] = typeof part.value === "string" ? part.value : String(part.value ?? "")
    }
  }

  return { fields, fileBuffer, fileName, mimetype }
}

export async function invoicesRoutes(app: FastifyInstance) {
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  }

  // ─── Extract invoice fields from PDF via AI ──────────────────────────
  app.post("/api/invoices/extract", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const entityId = await getActiveEntityId()
      const { fileBuffer, fileName, mimetype } = await parseMultipart(request)

      if (!fileBuffer || !fileName) {
        return reply.code(400).send({ success: false, error: "PDF file is required" })
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

      const suggested = await extractInvoiceFromPDF(attachments, user.id)

      return reply.send({
        success: true,
        fileId: persistedFile.id,
        fileName: persistedFile.filename,
        suggested,
      })
    } catch (error) {
      console.error("[invoices/extract] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Extract failed",
      })
    }
  })

  // ─── Create the invoice row once the user confirms ───────────────────
  app.post("/api/invoices/upload-external", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

      const entityId = await getActiveEntityId()
      const { fields, fileBuffer, fileName, mimetype } = await parseMultipart(request)

      if (!fields.number) {
        return reply.code(400).send({ success: false, error: "Invoice number is required" })
      }
      if (!fields.issueDate) {
        return reply.code(400).send({ success: false, error: "Issue date is required" })
      }

      const totalAmount = Number.parseFloat(fields.total ?? "0")
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        return reply.code(400).send({ success: false, error: "Invalid total" })
      }
      const vatRate = Number.parseFloat(fields.vatRate ?? "0")
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
        return reply.code(400).send({ success: false, error: "Invalid VAT rate" })
      }
      const currencyCode = (fields.currencyCode ?? "EUR").toUpperCase()
      if (!/^[A-Z]{3}$/.test(currencyCode)) {
        return reply.code(400).send({ success: false, error: "Invalid currency code" })
      }

      const issueDate = new Date(fields.issueDate)
      if (Number.isNaN(issueDate.getTime())) {
        return reply.code(400).send({ success: false, error: "Invalid issue date" })
      }
      const dueDate = fields.dueDate ? new Date(fields.dueDate) : null
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        return reply.code(400).send({ success: false, error: "Invalid due date" })
      }

      let pdfFileId: string
      let displayName: string
      if (fields.fileId) {
        const existing = await getFileById(fields.fileId, user.id)
        if (!existing) {
          return reply.code(404).send({ success: false, error: "Attached file not found" })
        }
        pdfFileId = existing.id
        displayName = existing.filename
      } else {
        if (!fileBuffer || !fileName) {
          return reply.code(400).send({ success: false, error: "PDF file is required" })
        }
        const persistedFile = await persistUploadedFile(user.id, entityId, {
          fileName,
          mimetype,
          buffer: fileBuffer,
          isReviewed: true,
        })
        pdfFileId = persistedFile.id
        displayName = persistedFile.filename
      }

      const totalMinorUnits = Math.round(totalAmount * 100)
      // Approximate pre-tax for the single line item. The authoritative total
      // is stored separately on the invoice row (`totalCents`) — display
      // layer trusts that value and derives the VAT as total − subtotal, so
      // this rounding only affects the visual subtotal split.
      const preTaxMinorUnits = vatRate > 0
        ? Math.round(totalMinorUnits / (1 + vatRate / 100))
        : totalMinorUnits

      const invoice = await createInvoice(user.id, {
        contactId: fields.contactId ? fields.contactId : null,
        pdfFileId,
        number: fields.number,
        status: fields.status ?? "sent",
        issueDate,
        dueDate,
        currencyCode,
        totalCents: totalMinorUnits,
        notes: fields.notes ?? null,
        items: [
          {
            description: displayName,
            quantity: 1,
            unitPrice: preTaxMinorUnits,
            vatRate,
            position: 0,
          },
        ],
      })

      return reply.send({ success: true, invoice: { id: invoice.id, number: invoice.number } })
    } catch (error) {
      console.error("[invoices/upload-external] Error:", error)
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      })
    }
  })

  // ─── Re-attach a PDF to an existing invoice row ──────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/invoices/:id/attach-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const entityId = await getActiveEntityId()
        const { fileBuffer, fileName, mimetype } = await parseMultipart(request)

        if (!fileBuffer || !fileName) {
          return reply.code(400).send({ success: false, error: "PDF file is required" })
        }

        const persistedFile = await persistUploadedFile(user.id, entityId, {
          fileName,
          mimetype,
          buffer: fileBuffer,
          isReviewed: true,
        })

        const updated = await setInvoicePdfFileId(
          request.params.id,
          user.id,
          persistedFile.id,
        )
        if (!updated) {
          return reply.code(404).send({ success: false, error: "Invoice not found" })
        }

        return reply.send({
          success: true,
          fileId: persistedFile.id,
          fileName: persistedFile.filename,
        })
      } catch (error) {
        console.error("[invoices/attach-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Attach failed",
        })
      }
    },
  )

  // ─── Regenerate the attached PDF from invoice data ───────────────────
  app.post<{ Params: { id: string } }>(
    "/api/invoices/:id/regenerate-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const invoice = await getInvoiceById(request.params.id, user.id)
        if (!invoice) {
          return reply.code(404).send({ success: false, error: "Invoice not found" })
        }

        const buffer = await renderInvoicePdfBuffer(invoice)
        const entityId = await getActiveEntityId()
        const persistedFile = await persistUploadedFile(user.id, entityId, {
          fileName: `${invoice.number}.pdf`,
          mimetype: "application/pdf",
          buffer,
          isReviewed: true,
        })

        const updated = await setInvoicePdfFileId(
          request.params.id,
          user.id,
          persistedFile.id,
        )
        if (!updated) {
          return reply.code(404).send({ success: false, error: "Invoice not found" })
        }

        return reply.send({
          success: true,
          fileId: persistedFile.id,
          fileName: persistedFile.filename,
        })
      } catch (error) {
        console.error("[invoices/regenerate-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Regenerate failed",
        })
      }
    },
  )
}
