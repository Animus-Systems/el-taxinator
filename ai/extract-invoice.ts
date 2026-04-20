import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings, preferSonnetForVision } from "@/models/settings"
import type { AnalyzeAttachment } from "./attachments"

/**
 * AI-extracted invoice fields from an uploaded PDF / image.
 *
 * All fields are suggestions — the user reviews them before saving.
 * `total` is in euros (pre-cents) and includes VAT.
 */
export type ExtractedInvoice = {
  number: string | null
  issueDate: string | null
  dueDate: string | null
  clientName: string | null
  clientTaxId: string | null
  clientAddress: string | null
  clientEmail: string | null
  clientPhone: string | null
  total: number | null
  currency: string | null
  vatRate: number | null
  notes: string | null
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | null
  confidence: number
}

export async function extractInvoiceFromPDF(
  attachments: AnalyzeAttachment[],
  userId: string,
): Promise<ExtractedInvoice> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))

  const prompt = `Look at this invoice (factura / receipt) and extract the fields below.

Rules:
- "total" is the FINAL amount the customer must pay in the INVOICE'S ISSUING CURRENCY (NOT converted). If the PDF shows "£602" with a footnote "(€692.72 settled)", "total" must be 602 and "currency" must be "GBP". The settlement in EUR is a bank/payment-processor detail, not the invoice amount. Use a decimal number (e.g. 120.00 for "120.00", 602 for "602").
- "currency" is the ISO-4217 3-letter code of the invoice's issuing currency: "EUR" for "€" / Spanish-format documents, "GBP" for "£", "USD" for "$" (watch out — "$" can mean CAD / AUD / MXN too; only use USD when the context confirms). If the document is purely Spanish/European and shows "€" only, return "EUR". Return null ONLY when no currency symbol or code is visible.
- "vatRate" is the VAT/IGIC/IVA percent applied (e.g. 7 for "IGIC 7%", 21 for "IVA 21%"). Return 0 if there is no tax line.
- "number" is the invoice number / factura number. Do NOT include the "#" prefix.
- "issueDate" is the issue date (Fecha emisión / Fecha) in ISO format yyyy-MM-dd.
- "dueDate" is the payment due date (Vencimiento) in yyyy-MM-dd, or null if not present.
- "clientName" is the person or company the invoice is issued TO (the customer / cliente), NOT the issuer.
- "clientTaxId" is the customer's NIF / CIF / VAT id, or null.
- "clientAddress" is the customer's full postal address joined on one line (street, postal code, city, province, country). Use null if not present.
- "clientEmail" is the customer's email, or null.
- "clientPhone" is the customer's phone number, or null.
- "notes" is a short human-readable summary of what was billed (e.g. "Western Digital 8TB HDD").
- "status" suggests the invoice state based on visual hints:
    * "cancelled" if the document is a credit note / rectificativa / void — any of: "Factura rectificativa", "Anulada", "Cancelled", "VOID", "Abono", "Nota de crédito", or a negative total with a reference to another invoice number.
    * "paid" if there's a clear paid stamp / "PAGADO" / "PAID" mark or a receipt confirmation.
    * "sent" otherwise for a regular issued invoice.
    * null if genuinely ambiguous.
- "confidence" is your overall confidence 0–1 that the extracted values are correct.

Return ONLY valid JSON matching this shape. Use null for any field you cannot determine confidently.`

  const schema = {
    type: "object",
    properties: {
      number: { type: ["string", "null"] },
      issueDate: { type: ["string", "null"] },
      dueDate: { type: ["string", "null"] },
      clientName: { type: ["string", "null"] },
      clientTaxId: { type: ["string", "null"] },
      clientAddress: { type: ["string", "null"] },
      clientEmail: { type: ["string", "null"] },
      clientPhone: { type: ["string", "null"] },
      total: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      vatRate: { type: ["number", "null"] },
      notes: { type: ["string", "null"] },
      status: {
        type: ["string", "null"],
        enum: ["draft", "sent", "paid", "overdue", "cancelled", null],
      },
      confidence: { type: "number" },
    },
    required: ["confidence"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema, attachments })
  if (response.error) throw new Error(response.error)

  const out = response.output as Record<string, unknown>
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null
  const asNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null

  const rawStatus = asString(out["status"])?.toLowerCase() ?? null
  const status: ExtractedInvoice["status"] =
    rawStatus === "draft" ||
    rawStatus === "sent" ||
    rawStatus === "paid" ||
    rawStatus === "overdue" ||
    rawStatus === "cancelled"
      ? rawStatus
      : null

  const rawCurrency = asString(out["currency"])?.toUpperCase() ?? null
  const currency = rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null

  return {
    number: asString(out["number"]),
    issueDate: asString(out["issueDate"]),
    dueDate: asString(out["dueDate"]),
    clientName: asString(out["clientName"]),
    clientTaxId: asString(out["clientTaxId"]),
    clientAddress: asString(out["clientAddress"]),
    clientEmail: asString(out["clientEmail"]),
    clientPhone: asString(out["clientPhone"]),
    total: asNumber(out["total"]),
    currency,
    vatRate: asNumber(out["vatRate"]),
    notes: asString(out["notes"]),
    status,
    confidence: asNumber(out["confidence"]) ?? 0,
  }
}
