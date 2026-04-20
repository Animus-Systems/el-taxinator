import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings, preferSonnetForVision } from "@/models/settings"
import type { AnalyzeAttachment } from "./attachments"

/**
 * AI-extracted vendor-receipt fields (the paper we need to keep to deduct an
 * expense — ticket/factura/recibo/invoice from a supplier).
 *
 * All fields are suggestions; the user reviews them before attaching the
 * receipt to a transaction. `total` is in euros (pre-cents) and includes VAT.
 */
export type ExtractedReceipt = {
  vendor: string | null
  vendorTaxId: string | null
  total: number | null
  vatRate: number | null
  issueDate: string | null
  currency: string | null
  paymentMethod: "cash" | "card" | "transfer" | "other" | null
  notes: string | null
  confidence: number
}

export async function extractReceiptFromFile(
  attachments: AnalyzeAttachment[],
  userId: string,
): Promise<ExtractedReceipt> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))

  const prompt = `Look at this receipt / vendor invoice / ticket (factura / recibo / ticket) and extract the fields below.

This is a document WE RECEIVED from a supplier, not one we issued. Focus on the VENDOR side of the document.

Rules:
- "vendor" is the company that issued this receipt (the supplier, e.g. "Leroy Merlin", "Vodafone", "Mercadona"). Prefer the trading name over a legal suffix when both are present.
- "vendorTaxId" is the vendor's NIF / CIF / VAT id, or null. A valid tax id is what makes this a deductible "factura" rather than a plain "ticket".
- "total" is the FINAL amount paid, INCLUDING any VAT/IGIC/IVA. Decimal number in euros (e.g. 120.00 for "120,00€").
- "vatRate" is the VAT/IGIC/IVA percent applied (e.g. 7 for "IGIC 7%", 21 for "IVA 21%"). Return 0 if there is no tax line.
- "issueDate" is the issue date (Fecha / Fecha emisión) in ISO format yyyy-MM-dd.
- "currency" is the ISO 4217 code (default "EUR" for Spanish receipts).
- "paymentMethod" is "cash" | "card" | "transfer" | "other" — look for indicators like "EFECTIVO" (cash), "TARJETA" / "VISA" (card), "TRANSFERENCIA" (transfer). Use null if unclear.
- "notes" is a short human-readable summary of what was bought (e.g. "Drill + screws", "Mobile phone bill").
- "confidence" is your overall 0–1 confidence that the extracted values are correct.

Return ONLY valid JSON matching this shape. Use null for any field you cannot determine confidently.`

  const schema = {
    type: "object",
    properties: {
      vendor: { type: ["string", "null"] },
      vendorTaxId: { type: ["string", "null"] },
      total: { type: ["number", "null"] },
      vatRate: { type: ["number", "null"] },
      issueDate: { type: ["string", "null"] },
      currency: { type: ["string", "null"] },
      paymentMethod: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
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

  const rawPaymentMethod = asString(out["paymentMethod"])?.toLowerCase() ?? null
  const paymentMethod: ExtractedReceipt["paymentMethod"] =
    rawPaymentMethod === "cash" ||
    rawPaymentMethod === "card" ||
    rawPaymentMethod === "transfer" ||
    rawPaymentMethod === "other"
      ? rawPaymentMethod
      : null

  return {
    vendor: asString(out["vendor"]),
    vendorTaxId: asString(out["vendorTaxId"]),
    total: asNumber(out["total"]),
    vatRate: asNumber(out["vatRate"]),
    issueDate: asString(out["issueDate"]),
    currency: asString(out["currency"])?.toUpperCase() ?? null,
    paymentMethod,
    notes: asString(out["notes"]),
    confidence: asNumber(out["confidence"]) ?? 0,
  }
}
