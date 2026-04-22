/**
 * Fastify routes for quote PDFs. Mirror the invoice endpoints so quotes
 * get the same Preview / Regenerate UX:
 *
 * POST /api/quotes/preview-pdf
 *   Streams a PDF of the in-progress quote form state. No DB write.
 *
 * POST /api/quotes/:id/regenerate-pdf
 *   Renders the saved quote and attaches the fresh PDF, replacing any
 *   previously attached file.
 */
import type { FastifyInstance } from "fastify"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getActiveEntityId } from "@/lib/entities"
import { getFileById } from "@/models/files"
import { getContactById } from "@/models/contacts"
import { renderInvoicePdfBuffer } from "@/components/invoicing/invoice-pdf"
import {
  QUOTE_DEFAULT_LABEL_OVERRIDES,
  loadTemplateWithLogo,
  regenerateQuotePdfForId,
} from "@/lib/invoice-pdf-generation"
import type { InvoiceWithRelations } from "@/models/invoices"
import type { InvoiceItem, InvoiceTemplate } from "@/lib/db-types"

/**
 * tRPC's Fastify adapter overrides the default JSON parser to leave the
 * body as a raw string (so tRPC can handle its own deserialization).
 * That override is app-wide, so every plain JSON POST route has to decode
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

type PreviewItem = {
  description?: string
  quantity?: number
  unitPrice?: number
  vatRate?: number
  position?: number
  productId?: string | null
}

type QuotePreviewBody = {
  number?: string
  issueDate?: string
  expiryDate?: string | null
  contactId?: string | null
  notes?: string | null
  templateId?: string | null
  items?: PreviewItem[]
}

function fallbackQuoteNumber(): string {
  const now = new Date()
  return `Q-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}-001`
}

function buildSyntheticQuoteForPreview(
  body: QuotePreviewBody,
  userId: string,
): InvoiceWithRelations {
  const issueDate = body.issueDate ? new Date(body.issueDate) : new Date()
  const issueDateSafe = Number.isNaN(issueDate.getTime()) ? new Date() : issueDate
  const expiryRaw = body.expiryDate ? new Date(body.expiryDate) : null
  const expiryDate = expiryRaw && !Number.isNaN(expiryRaw.getTime()) ? expiryRaw : null
  const number = body.number && body.number.trim() ? body.number.trim() : fallbackQuoteNumber()
  const rawItems: PreviewItem[] = Array.isArray(body.items) ? body.items : []
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
    kind: "invoice",
    status: "draft",
    issueDate: issueDateSafe,
    dueDate: expiryDate,
    paidAt: null,
    notes: body.notes ?? null,
    currencyCode: "EUR",
    totalCents: null,
    irpfRate: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: null,
    items,
  }
}

/** Build a synthetic template that injects QUOTE-flavored label overrides,
 *  preserving the picked template's other fields (accent color, logo
 *  position, etc.). When no template is picked, still renders with the
 *  QUOTE overrides on otherwise-default styling. */
function withQuoteOverrides(
  template: InvoiceTemplate | null,
): InvoiceTemplate {
  if (!template) {
    return {
      id: "synthetic-quote-labels",
      userId: "",
      name: "synthetic",
      isDefault: false,
      logoFileId: null,
      logoPosition: "left",
      accentColor: "#4f46e5",
      fontPreset: "helvetica",
      headerText: null,
      footerText: null,
      bankDetailsText: null,
      businessDetailsText: null,
      belowTotalsText: null,
      showProminentTotal: false,
      showVatColumn: true,
      labels: { ...QUOTE_DEFAULT_LABEL_OVERRIDES },
      showBankDetails: false,
      paymentTermsDays: null,
      language: "es",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  return {
    ...template,
    labels: { ...(template.labels ?? {}), ...QUOTE_DEFAULT_LABEL_OVERRIDES },
  }
}

export async function quotesRoutes(app: FastifyInstance) {
  // ─── Render a PDF preview from in-progress quote form state ──────────
  app.post<{ Body: unknown }>(
    "/api/quotes/preview-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const body = parseJsonBody<QuotePreviewBody>(request.body)
        const synthetic = buildSyntheticQuoteForPreview(body, user.id)
        const client = body.contactId
          ? await getContactById(body.contactId, user.id)
          : null
        synthetic.client = client

        const entityId = await getActiveEntityId()
        const { template, logoBytes } = await loadTemplateWithLogo(
          body.templateId ?? null,
          user.id,
          entityId,
        )
        const buffer = await renderInvoicePdfBuffer(synthetic, {
          template: withQuoteOverrides(template),
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
        console.error("[quotes/preview-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Preview failed",
        })
      }
    },
  )

  // ─── Regenerate attached PDF for a saved quote ───────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/quotes/:id/regenerate-pdf",
    async (request, reply) => {
      try {
        const user = await getOrCreateSelfHostedUser()
        if (!user) return reply.code(401).send({ success: false, error: "Not authenticated" })

        const fileId = await regenerateQuotePdfForId(request.params.id, user)
        if (!fileId) {
          return reply.code(404).send({ success: false, error: "Quote not found" })
        }
        const file = await getFileById(fileId, user.id)
        return reply.send({
          success: true,
          fileId,
          fileName: file?.filename ?? "",
        })
      } catch (error) {
        console.error("[quotes/regenerate-pdf] Error:", error)
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Regenerate failed",
        })
      }
    },
  )
}
