import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings, preferSonnetForVision } from "@/models/settings"
import { isXlsxFileName, isXlsxMimeType, xlsxBufferToCsv } from "@/lib/xlsx-to-csv"
import type { AnalyzeAttachment } from "./attachments"

/**
 * One purchase candidate pulled out of a document. The same shape handles the
 * three input modes: a "libro" register (many rows in one file), a single
 * supplier invoice PDF, and a small receipt image — the LLM decides how many
 * items to emit based on what the document actually contains.
 */
export type ExtractedPurchase = {
  supplierName: string | null
  supplierTaxId: string | null
  supplierInvoiceNumber: string
  issueDate: string | null      // YYYY-MM-DD
  dueDate: string | null
  currencyCode: string | null
  status: "draft" | "received" | "overdue" | "paid" | "cancelled" | "refunded" | null
  irpfRate: number | null       // 0 | 7 | 15 | 19 | …
  notes: string | null
  /** Printed grand total including VAT, in MAJOR units (e.g. 36.97 means
   *  €36.97). Null when not visible. The router stores this as totalCents on
   *  the purchase row so later reads don't drift from integer-cent VAT
   *  reconstruction. */
  totalAmount: number | null
  items: Array<{
    description: string
    quantity: number
    /** Unit price in euros (NOT cents). The client converts to cents before submit. */
    unitPrice: number
    /** VAT/IGIC rate as a percentage number: 0, 3, 7, 9.5, 21 … */
    vatRate: number
  }>
  confidence: number
}

const PURCHASE_SCHEMA = {
  type: "object",
  properties: {
    purchases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          supplierName: { type: ["string", "null"] },
          supplierTaxId: { type: ["string", "null"] },
          supplierInvoiceNumber: { type: "string" },
          issueDate: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"] },
          currencyCode: { type: ["string", "null"] },
          status: {
            type: ["string", "null"],
            enum: ["draft", "received", "overdue", "paid", "cancelled", "refunded", null],
          },
          irpfRate: { type: ["number", "null"] },
          notes: { type: ["string", "null"] },
          totalAmount: { type: ["number", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
                vatRate: { type: "number" },
              },
              required: ["description", "quantity", "unitPrice", "vatRate"],
            },
          },
          confidence: { type: "number" },
        },
        required: ["supplierInvoiceNumber", "items", "confidence"],
      },
    },
  },
  required: ["purchases"],
}

const PROMPT = `You are extracting supplier-invoice / purchase records from a document for a Spanish tax app. The input can be any of:
- A "libro de facturas recibidas" (register of received invoices) in CSV/XLSX/PDF — expect many rows.
- A single supplier invoice PDF or scan — expect ONE purchase, possibly with several line items.
- A receipt image (ticket, restaurant check, fuel station slip) — expect ONE purchase with a single summary line item.

For each purchase extract:
- supplierName: the vendor / proveedor. Trading name preferred over legal suffix. Null if truly absent.
- supplierTaxId: Spanish NIF/CIF or EU VAT id. Null if not visible.
- supplierInvoiceNumber: the supplier's own invoice number VERBATIM — this is mandatory in Spanish audits. For receipts that have no invoice number, use the ticket number; if none, synthesize a short date-based ref like "TICKET-YYYYMMDD".
- issueDate: ISO YYYY-MM-DD. Required for the register to work — null only when genuinely absent.
- dueDate: ISO YYYY-MM-DD or null.
- currencyCode: 3-letter ISO (EUR, USD, GBP). Default "EUR" for €/euro symbol or unstated Spanish invoices.
- status: "paid" only if explicitly stamped "PAGADA"/"PAID". "cancelled" if stamped annulled/rectified. Otherwise "received" — don't guess beyond what the document says.
- irpfRate: retención IRPF percentage visible on the invoice (e.g. 7, 15). 0 when none is applied. Null only when you can't tell.
- notes: short free text (payment terms, reference, project). Null when nothing to keep.
- totalAmount: the printed grand total INCLUDING VAT in EUROS (e.g. 36.97 means €36.97). Read it verbatim from the invoice's "TOTAL" / "Total a pagar" line — do NOT compute it from the line items. Return null only if no grand total is printed on the document (never for a register row where the total column is visible). This is what we store as the authoritative amount, so don't reconstruct, don't round, don't re-apply VAT.
- items: line items. Each has description (string), quantity (number, default 1), unitPrice (NUMBER IN EUROS — NOT cents), and vatRate (VAT/IGIC rate as a percentage number, e.g. 7 for 7% IGIC, 21 for 21% IVA; use 0 when exempt).
  - For a single receipt/ticket with only a total: emit ONE item with description = vendor + receipt purpose, quantity = 1, unitPrice = the base amount (pre-VAT, derive from total and VAT rate when both visible), vatRate = the VAT rate.
  - For a multi-line invoice: one item per printed line.
  - For a register where only totals are shown per row: emit ONE item with description = "Base imponible", quantity = 1, unitPrice = base amount, vatRate = the row's VAT rate.
- confidence: 0–1 for this specific purchase row.

Rules:
- Do NOT invent numbers. If unitPrice and vatRate can't both be derived, lower confidence rather than guess.
- Unit prices are in EUROS (not cents). The caller converts.
- Skip register rows that are totals/subtotals/headers.
- If the document is not a purchase/register/receipt at all, return { purchases: [] }.

Return ONLY valid JSON matching { purchases: [...] }.`

function needsTextInline(fileName: string, mimetype: string): boolean {
  if (isXlsxFileName(fileName) || isXlsxMimeType(mimetype)) return true
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return true
  if (mimetype === "text/csv" || mimetype === "text/tab-separated-values") return true
  if (mimetype.startsWith("text/")) return true
  return false
}

export async function extractPurchasesFromFile(
  userId: string,
  file: { filename: string; mimetype: string; buffer: Buffer },
): Promise<ExtractedPurchase[]> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))

  let prompt = PROMPT
  let attachments: AnalyzeAttachment[] = []

  if (needsTextInline(file.filename, file.mimetype)) {
    const text = isXlsxFileName(file.filename) || isXlsxMimeType(file.mimetype)
      ? xlsxBufferToCsv(file.buffer)
      : file.buffer.toString("utf-8")
    const MAX_CHARS = 60_000
    const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n…(truncated)" : text
    prompt = `${PROMPT}\n\nSource document: ${file.filename}\n\n<<<\n${truncated}\n>>>`
  } else {
    attachments = [
      {
        filename: file.filename,
        contentType: file.mimetype || "application/octet-stream",
        base64: file.buffer.toString("base64"),
      },
    ]
  }

  const response = await requestLLM(llmSettings, { prompt, schema: PURCHASE_SCHEMA, attachments })
  if (response.error) throw new Error(response.error)

  const raw = response.output as { purchases?: unknown }
  const items = Array.isArray(raw.purchases) ? raw.purchases : []

  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null
  const asNumber = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0
  const asBounded = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  const asStatus = (v: unknown): ExtractedPurchase["status"] => {
    const s = typeof v === "string" ? v.toLowerCase() : null
    if (
      s === "draft" || s === "received" || s === "overdue" ||
      s === "paid" || s === "cancelled" || s === "refunded"
    ) return s
    return null
  }

  const out: ExtractedPurchase[] = []
  for (const row of items) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const number = asString(r["supplierInvoiceNumber"])
    const rawItems = Array.isArray(r["items"]) ? r["items"] : []
    const mappedItems = rawItems
      .filter((it): it is Record<string, unknown> => typeof it === "object" && it !== null)
      .map((it) => ({
        description: asString(it["description"]) ?? "",
        quantity: asNumber(it["quantity"]) || 1,
        unitPrice: asNumber(it["unitPrice"]),
        vatRate: asNumber(it["vatRate"]),
      }))
      .filter((it) => it.description.trim() !== "")
    if (!number || mappedItems.length === 0) continue

    const totalAmount =
      typeof r["totalAmount"] === "number" && Number.isFinite(r["totalAmount"])
        ? (r["totalAmount"] as number)
        : null
    out.push({
      supplierName: asString(r["supplierName"]),
      supplierTaxId: asString(r["supplierTaxId"]),
      supplierInvoiceNumber: number,
      issueDate: asString(r["issueDate"]),
      dueDate: asString(r["dueDate"]),
      currencyCode: asString(r["currencyCode"]) ?? "EUR",
      status: asStatus(r["status"]),
      irpfRate: typeof r["irpfRate"] === "number" ? r["irpfRate"] : null,
      notes: asString(r["notes"]),
      totalAmount,
      items: mappedItems,
      confidence: asBounded(r["confidence"]),
    })
  }
  return out
}
