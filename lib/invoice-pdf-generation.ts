/**
 * Shared server-side helpers for rendering and persisting invoice (and
 * quote) PDFs. Used by the Fastify regenerate-pdf route, the preview route,
 * and tRPC mutations that auto-regenerate the PDF on create / status
 * change so the attached file is always fresh without the user pressing a
 * button.
 */

import { readFile } from "node:fs/promises"

import { getActiveEntityId } from "@/lib/entities"
import { fullPathForFile } from "@/lib/files"
import { persistUploadedFile, getFileById } from "@/models/files"
import {
  getInvoiceById,
  setInvoicePdfFileId,
  getQuoteById,
  setQuotePdfFileId,
  type InvoiceWithRelations,
  type QuoteWithRelations,
} from "@/models/invoices"
import { getTemplateById } from "@/models/invoice-templates"
import { getEurPerUnit } from "@/models/fx-rates"
import { renderInvoicePdfBuffer } from "@/components/invoicing/invoice-pdf"
import type {
  InvoiceTemplate,
  User,
  InvoiceTemplateLabels,
  InvoiceItem,
  Product,
} from "@/lib/db-types"

// ───────────────────────────────────────────────────────────────────────────
// FX rate locking for non-EUR invoices
// ───────────────────────────────────────────────────────────────────────────

/** Inputs applyFxRate reads from the invoice-like entity under save. */
export type FxApplyInputs = {
  currencyCode: string
  issueDate: Date
  fxRateToEur: string | null
  fxRateDate: Date | null
  /** Pass the already-stored source so the idempotent keep can preserve it.
   *  Fresh lookups overwrite this with ECB's attribution URL. */
  fxRateSource?: string | null
}

/** Output written back onto the invoice row. `fxRateSource` is only
 *  populated on a fresh lookup — idempotent keeps preserve whatever was
 *  stored previously (via the caller's existing row). */
export type FxApplyResult = {
  fxRateToEur: string | null
  fxRateDate: Date | null
  fxRateSource: string | null
}

/**
 * Compute the locked FX rate columns for an invoice about to be saved.
 *
 * - EUR invoices: all nulls (also clears any prior values if the currency
 *   was switched from a foreign currency back to EUR).
 * - Non-EUR with no stored rate yet: look up the ECB reference rate for
 *   `issueDate` and return that.
 * - Non-EUR with a stored rate whose `fxRateDate` is within
 *   `FX_IDEMPOTENCY_WINDOW_DAYS` of the current `issueDate`: keep it —
 *   re-saving the invoice shouldn't force a fresh ECB lookup.
 * - Non-EUR with a stored rate older than the window (e.g. user bumped the
 *   issue date by a month): re-lookup.
 *
 * Returns all-nulls when the ECB lookup returns null — never throws.
 */
const FX_IDEMPOTENCY_WINDOW_DAYS = 7
const MS_PER_DAY = 86_400_000

export async function applyFxRate(entity: FxApplyInputs): Promise<FxApplyResult> {
  const code = entity.currencyCode.trim().toUpperCase()
  if (code === "EUR") {
    return { fxRateToEur: null, fxRateDate: null, fxRateSource: null }
  }

  if (entity.fxRateToEur && entity.fxRateDate) {
    const diffDays =
      Math.abs(entity.issueDate.getTime() - entity.fxRateDate.getTime()) / MS_PER_DAY
    if (diffDays <= FX_IDEMPOTENCY_WINDOW_DAYS) {
      return {
        fxRateToEur: entity.fxRateToEur,
        fxRateDate: entity.fxRateDate,
        fxRateSource: entity.fxRateSource ?? null,
      }
    }
  }

  const fresh = await getEurPerUnit(code, entity.issueDate)
  if (!fresh) {
    return { fxRateToEur: null, fxRateDate: null, fxRateSource: null }
  }
  return {
    fxRateToEur: fresh.eurPerUnit,
    fxRateDate: fresh.effectiveDate,
    fxRateSource: fresh.source,
  }
}

/**
 * Resolve a templateId to the template row plus pre-loaded logo bytes.
 * Falls back gracefully to nulls when anything is missing or the logo
 * file can't be read — the renderer treats a null template as "use
 * defaults".
 */
export async function loadTemplateWithLogo(
  templateId: string | null | undefined,
  userId: string,
  entityId: string,
): Promise<{ template: InvoiceTemplate | null; logoBytes: Buffer | null }> {
  if (!templateId) return { template: null, logoBytes: null }
  const template = await getTemplateById(templateId, userId)
  if (!template) return { template: null, logoBytes: null }
  if (!template.logoFileId) return { template, logoBytes: null }
  const file = await getFileById(template.logoFileId, userId)
  if (!file) return { template, logoBytes: null }
  try {
    const absolute = fullPathForFile(entityId, file)
    const bytes = await readFile(absolute)
    return { template, logoBytes: bytes }
  } catch {
    return { template, logoBytes: null }
  }
}

/**
 * Render the invoice to PDF using its template (if any) and the user's
 * business overrides, persist the bytes, and attach the new file to the
 * invoice row — replacing any previously attached PDF. Returns the new
 * fileId, or null if the invoice vanished mid-flight. Errors while
 * loading the logo, template, or writing the file bubble up — callers
 * that want fire-and-forget semantics should wrap in try/catch.
 */
export async function regenerateInvoicePdfForId(
  invoiceId: string,
  user: User,
  labelOverrides?: Partial<InvoiceTemplateLabels>,
): Promise<string | null> {
  const invoice = await getInvoiceById(invoiceId, user.id)
  if (!invoice) return null
  const entityId = await getActiveEntityId()
  const { template, logoBytes } = await loadTemplateWithLogo(
    invoice.templateId,
    user.id,
    entityId,
  )
  const effectiveTemplate: InvoiceTemplate | null =
    labelOverrides && Object.keys(labelOverrides).length > 0
      ? mergeLabelOverrides(template, labelOverrides)
      : template
  const buffer = await renderInvoicePdfBuffer(invoice, {
    template: effectiveTemplate,
    logoBytes,
    ...(user.businessName ? { businessName: user.businessName } : {}),
    ...(user.businessAddress ? { businessAddress: user.businessAddress } : {}),
    ...(user.businessTaxId ? { businessTaxId: user.businessTaxId } : {}),
  })
  const persistedFile = await persistUploadedFile(user.id, entityId, {
    fileName: `${invoice.number}.pdf`,
    mimetype: "application/pdf",
    buffer,
    isReviewed: true,
  })
  const updated = await setInvoicePdfFileId(invoiceId, user.id, persistedFile.id)
  return updated ? persistedFile.id : null
}

/**
 * Returns a synthetic template with the caller's label overrides merged
 * on top of the real template's labels. Lets quote rendering reuse an
 * invoice template but force the title/column headers to quote-flavored
 * defaults ("QUOTE" instead of "INVOICE", etc.).
 */
function mergeLabelOverrides(
  template: InvoiceTemplate | null,
  overrides: Partial<InvoiceTemplateLabels>,
): InvoiceTemplate {
  if (!template) {
    // No template — still need to pass the overrides to the renderer. Build
    // a synthetic template row with only the labels populated; every other
    // field matches the renderer's defaults so nothing visual changes
    // except the override-driven label text.
    return {
      id: "synthetic-labels",
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
      labels: overrides as InvoiceTemplateLabels,
      showBankDetails: false,
      paymentTermsDays: null,
      language: "es",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  return {
    ...template,
    labels: { ...(template.labels ?? {}), ...overrides },
  }
}

/** Fire-and-log wrapper: never throws, logs failures so the caller's main
 *  flow (e.g. a tRPC create mutation) isn't blocked by PDF-rendering
 *  issues. */
export async function regenerateInvoicePdfSafe(
  invoiceId: string,
  user: User,
  labelOverrides?: Partial<InvoiceTemplateLabels>,
): Promise<void> {
  try {
    await regenerateInvoicePdfForId(invoiceId, user, labelOverrides)
  } catch (error) {
    console.error(`[invoice-pdf] regenerate failed for ${invoiceId}`, error)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Quotes — share the invoice renderer by adapting a Quote into the shape the
// renderer expects, then layering a QUOTE-flavored title over whatever
// template the user picked.
// ───────────────────────────────────────────────────────────────────────────

/** Renderer expects InvoiceWithRelations; this converter gives a quote the
 *  shape it needs without creating a separate renderer. Missing invoice-only
 *  fields (quoteId, pdfFileId, paidAt, currencyCode, totalCents, kind, irpf)
 *  default to sensible neutral values that don't visually distinguish the
 *  output. Items are re-shaped from quote_items → invoice_items (swap
 *  quoteId → invoiceId) since the renderer only reads the shared columns
 *  (description, quantity, unitPrice, vatRate). */
export function quoteToInvoiceShape(
  quote: QuoteWithRelations,
): InvoiceWithRelations {
  return {
    id: quote.id,
    userId: quote.userId,
    contactId: quote.contactId,
    quoteId: null,
    pdfFileId: quote.pdfFileId,
    templateId: quote.templateId,
    number: quote.number,
    kind: "invoice",
    status: quote.status,
    issueDate: quote.issueDate,
    dueDate: quote.expiryDate,
    paidAt: null,
    notes: quote.notes,
    currencyCode: "EUR",
    totalCents: null,
    irpfRate: 0,
    // Quotes are EUR-only at the DB level, so the FX block never renders.
    fxRateToEur: null,
    fxRateDate: null,
    fxRateSource: null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    client: quote.client,
    items: quote.items.map((it): InvoiceItem & { product?: Product | null } => ({
      id: it.id,
      invoiceId: quote.id,
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
      position: it.position,
      ...(it.product !== undefined ? { product: it.product } : {}),
    })),
  }
}

const QUOTE_DEFAULT_LABEL_OVERRIDES: Partial<InvoiceTemplateLabels> = {
  invoiceTitle: "QUOTE",
  dueDate: "Expires",
  totalToPay: "TOTAL",
  prominentTotal: "Total",
}

export async function regenerateQuotePdfForId(
  quoteId: string,
  user: User,
  extraLabelOverrides?: Partial<InvoiceTemplateLabels>,
): Promise<string | null> {
  const quote = await getQuoteById(quoteId, user.id)
  if (!quote) return null
  const entityId = await getActiveEntityId()
  const { template, logoBytes } = await loadTemplateWithLogo(
    quote.templateId,
    user.id,
    entityId,
  )
  const mergedOverrides: Partial<InvoiceTemplateLabels> = {
    ...QUOTE_DEFAULT_LABEL_OVERRIDES,
    ...(extraLabelOverrides ?? {}),
  }
  const effectiveTemplate = mergeLabelOverrides(template, mergedOverrides)
  const buffer = await renderInvoicePdfBuffer(quoteToInvoiceShape(quote), {
    template: effectiveTemplate,
    logoBytes,
    ...(user.businessName ? { businessName: user.businessName } : {}),
    ...(user.businessAddress ? { businessAddress: user.businessAddress } : {}),
    ...(user.businessTaxId ? { businessTaxId: user.businessTaxId } : {}),
  })
  const persistedFile = await persistUploadedFile(user.id, entityId, {
    fileName: `${quote.number}.pdf`,
    mimetype: "application/pdf",
    buffer,
    isReviewed: true,
  })
  const updated = await setQuotePdfFileId(quoteId, user.id, persistedFile.id)
  return updated ? persistedFile.id : null
}

export async function regenerateQuotePdfSafe(
  quoteId: string,
  user: User,
): Promise<void> {
  try {
    await regenerateQuotePdfForId(quoteId, user)
  } catch (error) {
    console.error(`[invoice-pdf] quote regenerate failed for ${quoteId}`, error)
  }
}

export { QUOTE_DEFAULT_LABEL_OVERRIDES }
