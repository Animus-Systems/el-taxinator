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
import { createInvoice, setInvoicePdfFileId, type InvoiceWithRelations } from "@/models/invoices"
import { extractInvoiceFromPDF } from "@/ai/extract-invoice"
import { renderInvoicePdfBuffer } from "@/components/invoicing/invoice-pdf"
import type { AnalyzeAttachment } from "@/ai/attachments"
import type { InvoiceItem } from "@/lib/db-types"
import { getContactById } from "@/models/contacts"
import {
  loadTemplateWithLogo,
  regenerateInvoicePdfForId,
} from "@/lib/invoice-pdf-generation"
import { getEurPerUnit } from "@/models/fx-rates"
import { fullPathForFile } from "@/lib/files"
import { readFile } from "node:fs/promises"

type Fields = {
  number?: string
  kind?: string
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

type PreviewItem = {
  description?: string
  quantity?: number
  unitPrice?: number
  vatRate?: number
  position?: number
  productId?: string | null
}

type PreviewPdfBody = {
  number?: string
  kind?: string
  issueDate?: string
  dueDate?: string | null
  contactId?: string | null
  currencyCode?: string
  totalCents?: number | null
  notes?: string | null
  irpfRate?: number
  templateId?: string | null
  items?: PreviewItem[]
}

/**
 * Build a fully-typed InvoiceWithRelations from loose form input without
 * touching the database. Every renderer-relied-on field is defaulted so an
 * in-progress draft never trips calcInvoiceTotals or the PDF components.
 */
/** Date-stamped placeholder number used when the preview payload arrives
 *  with an empty number field — so the rendered "INVOICE #" always shows
 *  something meaningful instead of a dangling hash. */
function fallbackPreviewNumber(kind: "invoice" | "simplified"): string {
  const now = new Date()
  const prefix = kind === "simplified" ? "R" : "F"
  return `${prefix}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}-001`
}

function buildSyntheticInvoiceForPreview(
  body: PreviewPdfBody,
  userId: string,
): InvoiceWithRelations {
  const issueDate = body.issueDate ? new Date(body.issueDate) : new Date()
  const issueDateSafe = Number.isNaN(issueDate.getTime()) ? new Date() : issueDate
  const dueDateRaw = body.dueDate ? new Date(body.dueDate) : null
  const dueDate = dueDateRaw && !Number.isNaN(dueDateRaw.getTime()) ? dueDateRaw : null
  const kind = body.kind === "simplified" ? "simplified" : "invoice"
  const currencyCode = (body.currencyCode ?? "EUR").toUpperCase().slice(0, 3) || "EUR"
  const number = body.number && body.number.trim() ? body.number.trim() : fallbackPreviewNumber(kind)
  const rawItems: PreviewItem[] = Array.isArray(body.items) ? body.items : []
  // When the form has no line items yet, drop in a single sample row so the
  // preview renders totals/columns/styling meaningfully. Marking the row with
  // a zero unit_price keeps totals at zero while still exercising the table.
  const items: (InvoiceItem & { product?: null })[] =
    rawItems.length > 0
      ? rawItems.map((item, index) => ({
          id: `preview-item-${index}`,
          invoiceId: "preview",
          productId: item.productId ?? null,
          description: item.description ?? "",
          quantity: Number.isFinite(item.quantity) ? Number(item.quantity) : 0,
          unitPrice: Number.isFinite(item.unitPrice) ? Number(item.unitPrice) : 0,
          vatRate: Number.isFinite(item.vatRate) ? Number(item.vatRate) : 0,
          position: Number.isFinite(item.position) ? Number(item.position) : index,
          product: null,
        }))
      : [
          {
            id: "preview-item-sample",
            invoiceId: "preview",
            productId: null,
            description: "(Sample line — add items to see your real totals)",
            quantity: 1,
            unitPrice: 0,
            vatRate: 0,
            position: 0,
            product: null,
          },
        ]
  return {
    id: "preview",
    userId,
    contactId: body.contactId ?? null,
    quoteId: null,
    pdfFileId: null,
    templateId: body.templateId ?? null,
    number,
    kind,
    status: "draft",
    issueDate: issueDateSafe,
    dueDate,
    paidAt: null,
    notes: body.notes ?? null,
    currencyCode,
    totalCents: body.totalCents ?? null,
    irpfRate: Number.isFinite(body.irpfRate) ? Number(body.irpfRate) : 0,
    // FX fields are populated by the route handler after this call when
    // currencyCode !== EUR. Defaults keep EUR previews and failed lookups
    // rendering without the FX block.
    fxRateToEur: null,
    fxRateDate: null,
    fxRateSource: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: null,
    items,
  } satisfies InvoiceWithRelations
}

/**
 * Parse the request body as JSON even when Fastify's content-type parser
 * has been overridden to leave it as a raw string. The tRPC adapter
 * installs such an override (server/trpc-fastify.ts) which applies
 * app-wide, so every JSON POST route added outside tRPC has to decode
 * the body itself.
 */
function parseJsonBody<T>(raw: unknown): T {
  if (raw === null || raw === undefined) return {} as T
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T
    } catch {
      return {} as T
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8")) as T
    } catch {
      return {} as T
    }
  }
  return raw as T
}

// ─── Template live-preview helpers ──────────────────────────────────────

type TemplatePreviewBody = {
  name?: string
  logoFileId?: string | null
  logoPosition?: "left" | "right" | "center"
  accentColor?: string
  fontPreset?: "helvetica" | "times" | "courier"
  headerText?: string | null
  footerText?: string | null
  bankDetailsText?: string | null
  businessDetailsText?: string | null
  belowTotalsText?: string | null
  showProminentTotal?: boolean
  showVatColumn?: boolean
  labels?: Record<string, string> | null
  showBankDetails?: boolean
  paymentTermsDays?: number | null
  language?: "es" | "en"
  docType?: "invoice" | "quote"
}

function buildInMemoryTemplate(
  body: TemplatePreviewBody,
): import("@/lib/db-types").InvoiceTemplate {
  return {
    id: "preview",
    userId: "",
    name: body.name ?? "preview",
    isDefault: false,
    logoFileId: body.logoFileId ?? null,
    logoPosition: body.logoPosition ?? "left",
    accentColor: body.accentColor ?? "#4f46e5",
    fontPreset: body.fontPreset ?? "helvetica",
    headerText: body.headerText ?? null,
    footerText: body.footerText ?? null,
    bankDetailsText: body.bankDetailsText ?? null,
    businessDetailsText: body.businessDetailsText ?? null,
    belowTotalsText: body.belowTotalsText ?? null,
    showProminentTotal: body.showProminentTotal ?? false,
    showVatColumn: body.showVatColumn ?? true,
    labels: (body.labels ?? null) as import("@/lib/db-types").InvoiceTemplateLabels | null,
    showBankDetails: body.showBankDetails ?? false,
    paymentTermsDays: body.paymentTermsDays ?? null,
    language: body.language ?? "es",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Sample invoice used on the template editor's live preview panel.
 * Hard-coded client + three line items + tax + notes so every section of
 * the PDF is exercised; the designer sees how their accent color lands on
 * totals, how labels read with real data, etc.
 */
function buildSampleInvoiceForTemplatePreview(userId: string): InvoiceWithRelations {
  const issue = new Date()
  const due = new Date(issue)
  due.setDate(due.getDate() + 30)
  return {
    id: "preview",
    userId,
    contactId: "sample-contact",
    quoteId: null,
    pdfFileId: null,
    templateId: null,
    number: "F-2026-0042",
    kind: "invoice",
    // "sent" — a clean committed state so the designer doesn't see a
    // DRAFT watermark covering their design while they tweak it.
    status: "sent",
    issueDate: issue,
    dueDate: due,
    paidAt: null,
    notes: "Thank you for your business. Net 30.",
    currencyCode: "EUR",
    totalCents: null,
    irpfRate: 0,
    fxRateToEur: null,
    fxRateDate: null,
    fxRateSource: null,
    createdAt: issue,
    updatedAt: issue,
    client: {
      id: "sample-contact",
      userId,
      name: "Acme Corporation",
      email: "billing@acme.example",
      phone: null,
      mobile: null,
      address: "123 Example Street, 28001 Madrid",
      city: "Madrid",
      postalCode: "28001",
      province: "Madrid",
      country: "ES",
      taxId: "B12345678",
      bankDetails: null,
      notes: null,
      role: "client",
      kind: "company",
      createdAt: issue,
      updatedAt: issue,
    },
    items: [
      {
        id: "sample-item-1",
        invoiceId: "preview",
        productId: null,
        description: "Consulting services — Q1 retainer",
        quantity: 1,
        unitPrice: 300000, // €3,000
        vatRate: 21,
        position: 0,
        product: null,
      },
      {
        id: "sample-item-2",
        invoiceId: "preview",
        productId: null,
        description: "Monthly hosting",
        quantity: 3,
        unitPrice: 4500, // €45
        vatRate: 21,
        position: 1,
        product: null,
      },
      {
        id: "sample-item-3",
        invoiceId: "preview",
        productId: null,
        description: "Support hours",
        quantity: 8,
        unitPrice: 7500, // €75
        vatRate: 21,
        position: 2,
        product: null,
      },
    ],
  }
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

      const kind = fields.kind === "simplified" ? "simplified" : "invoice"

      const invoice = await createInvoice(user.id, {
        contactId: fields.contactId ? fields.contactId : null,
        pdfFileId,
        number: fields.number,
        kind,
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

  // ─── Live preview for the template editor ────────────────────────────
  // Accepts an in-progress template (what the user is typing in the
  // template form) and renders a sample invoice with that styling. Lets
  // the template designer show a side-by-side preview without saving.
  app.post<{ Body: unknown }>(
    "/api/invoice-templates/preview-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const body = parseJsonBody<TemplatePreviewBody>(request.body)
        const docType = body.docType === "quote" ? "quote" : "invoice"
        const template = buildInMemoryTemplate(body)

        // Load the logo bytes if the template has one. The file may not
        // exist yet (user hasn't uploaded), in which case we just render
        // without a logo.
        const entityId = await getActiveEntityId()
        let logoBytes: Buffer | null = null
        if (template.logoFileId) {
          const file = await getFileById(template.logoFileId, user.id)
          if (file) {
            try {
              const absolute = fullPathForFile(entityId, file)
              logoBytes = await readFile(absolute)
            } catch {
              logoBytes = null
            }
          }
        }

        // Layer quote-flavored label overrides when previewing as a quote
        // so one endpoint drives both preview panels.
        const effectiveTemplate =
          docType === "quote"
            ? {
                ...template,
                labels: {
                  ...(template.labels ?? {}),
                  invoiceTitle: template.labels?.invoiceTitle ?? "QUOTE",
                  dueDate: template.labels?.dueDate ?? "Expires",
                },
              }
            : template

        const sample = buildSampleInvoiceForTemplatePreview(user.id)
        const buffer = await renderInvoicePdfBuffer(sample, {
          template: effectiveTemplate,
          logoBytes,
          ...(user.businessName ? { businessName: user.businessName } : {}),
          ...(user.businessAddress ? { businessAddress: user.businessAddress } : {}),
          ...(user.businessTaxId ? { businessTaxId: user.businessTaxId } : {}),
        })
        reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", "inline")
        return reply.send(buffer)
      } catch (error) {
        console.error("[invoice-templates/preview-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Preview failed",
        })
      }
    },
  )

  // ─── Render a PDF preview from in-progress form state ────────────────
  // Accepts the current form payload (no DB insert) and streams a PDF back
  // so the user can preview the invoice before saving.
  app.post<{ Body: unknown }>(
    "/api/invoices/preview-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const body = parseJsonBody<PreviewPdfBody>(request.body)
        // Diagnostic log: helps trace why a preview is coming out empty.
        // Shows whether the body reached the handler populated, and which
        // fields resolved to defaults. Safe to leave on — one line per
        // request, no PII beyond the invoice number/currency.
        console.log(
          "[invoices/preview-pdf] body keys=%s number=%s currency=%s items=%d contact=%s template=%s",
          Object.keys(body).join(","),
          body.number ?? "(missing)",
          body.currencyCode ?? "(missing)",
          Array.isArray(body.items) ? body.items.length : -1,
          body.contactId ?? "(none)",
          body.templateId ?? "(none)",
        )
        const synthetic = buildSyntheticInvoiceForPreview(body, user.id)
        const client = body.contactId
          ? await getContactById(body.contactId, user.id)
          : null
        synthetic.client = client

        // Populate the FX block for non-EUR previews so the user sees the
        // "Price in EUR" block before saving. Skip gracefully on lookup
        // failures — preview rendering must never hard-fail.
        if (synthetic.currencyCode && synthetic.currencyCode !== "EUR") {
          const fx = await getEurPerUnit(synthetic.currencyCode, synthetic.issueDate)
          if (fx) {
            synthetic.fxRateToEur = fx.eurPerUnit
            synthetic.fxRateDate = fx.effectiveDate
            synthetic.fxRateSource = fx.source
          }
        }

        const entityId = await getActiveEntityId()
        const { template, logoBytes } = await loadTemplateWithLogo(
          body.templateId ?? null,
          user.id,
          entityId,
        )
        const buffer = await renderInvoicePdfBuffer(synthetic, {
          template,
          logoBytes,
          ...(user.businessName ? { businessName: user.businessName } : {}),
          ...(user.businessAddress ? { businessAddress: user.businessAddress } : {}),
          ...(user.businessTaxId ? { businessTaxId: user.businessTaxId } : {}),
        })
        reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", "inline")
        return reply.send(buffer)
      } catch (error) {
        console.error("[invoices/preview-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Preview failed",
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

        const fileId = await regenerateInvoicePdfForId(request.params.id, user)
        if (!fileId) {
          return reply.code(404).send({ success: false, error: "Invoice not found" })
        }
        const file = await getFileById(fileId, user.id)
        return reply.send({
          success: true,
          fileId,
          fileName: file?.filename ?? "",
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
