import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"
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
  vatRate: number | null
  notes: string | null
  confidence: number
}

export async function extractInvoiceFromPDF(
  attachments: AnalyzeAttachment[],
  userId: string,
): Promise<ExtractedInvoice> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  const prompt = `Look at this invoice (factura / receipt) and extract the fields below.

Rules:
- "total" is the FINAL amount the customer must pay, INCLUDING any VAT/IGIC/IVA. Use a decimal number in euros (e.g. 120.00 for "120,00€"). Spanish documents often use "Total" or "TOTAL A PAGAR".
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
      vatRate: { type: ["number", "null"] },
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
    vatRate: asNumber(out["vatRate"]),
    notes: asString(out["notes"]),
    confidence: asNumber(out["confidence"]) ?? 0,
  }
}
