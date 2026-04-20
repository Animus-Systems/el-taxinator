import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings, preferSonnetForVision } from "@/models/settings"
import { isXlsxFileName, isXlsxMimeType, xlsxBufferToCsv } from "@/lib/xlsx-to-csv"
import type { AnalyzeAttachment } from "./attachments"

/**
 * Each extracted contact. All fields mirror the Contact schema; everything
 * except `name` is nullable so the LLM is encouraged to emit partial data
 * rather than invent missing fields. `confidence` is per-row.
 */
export type ExtractedContact = {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  country: string | null
  taxId: string | null
  bankDetails: string | null
  notes: string | null
  role: "client" | "supplier" | "both" | null
  kind: "company" | "person" | null
  confidence: number
}

const CONTACT_SCHEMA = {
  type: "object",
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          mobile: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          postalCode: { type: ["string", "null"] },
          province: { type: ["string", "null"] },
          country: { type: ["string", "null"] },
          taxId: { type: ["string", "null"] },
          bankDetails: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          role: { type: ["string", "null"], enum: ["client", "supplier", "both", null] },
          kind: { type: ["string", "null"], enum: ["company", "person", null] },
          confidence: { type: "number" },
        },
        required: ["name", "confidence"],
      },
    },
  },
  required: ["contacts"],
}

const PROMPT = `You are extracting contact records from a document. A document could be a CSV/XLSX export, a PDF directory or address book, an image of a business card, or a scanned supplier letter with a letterhead. Return every contact/party you can confidently identify.

For each contact extract:
- name: company legal name OR person's full name. Prefer the trading name over a legal suffix when both are present.
- taxId: Spanish NIF/CIF or any VAT id. Null if not visible.
- email, phone, mobile: each null if absent. "phone" = landline; "mobile" = cell/mobile number.
- address: the street line only (e.g. "Calle Mayor 12, 2º B"). Do NOT include city/postal/province/country here — those go in dedicated fields.
- city, postalCode, province, country: each null if not derivable. For Spanish addresses, "province" is the provincia (e.g. "Madrid", "Las Palmas"), NOT the autonomous community.
- bankDetails: IBAN, BIC/SWIFT, account holder — whatever bank info is printed. One free-text line; null if absent.
- notes: anything short and contact-scoped the user might want (e.g. "Main accountant", "Weekend contact only"). Null when there's nothing to keep.
- role: "client" if they pay us, "supplier" if we pay them, "both" when evidence supports both, null when unclear. For a generic address-book CSV with no side indicator, null is fine.
- kind: "company" or "person". Default to "company" when it looks like a business (has VAT id, commercial suffix, incorporation tag). "person" when the row is clearly an individual (personal email, no company suffix, "Sr./Sra./D./Dña./Mr./Ms.").
- confidence: 0–1, your own confidence that the extracted row is a real contact (not a header, not a totals line, not an address fragment from another row).

Rules:
- Do NOT invent. Null any field you cannot ground in the source.
- Skip rows that are clearly not contacts: CSV headers, "Page 1 of N", totals, footers.
- Dedupe obvious duplicates before returning.
- If the source is mostly gibberish or doesn't contain contacts, return { contacts: [] }.

Return ONLY valid JSON matching { contacts: [...] }.`

function needsTextInline(fileName: string, mimetype: string): boolean {
  if (isXlsxFileName(fileName) || isXlsxMimeType(mimetype)) return true
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return true
  if (mimetype === "text/csv" || mimetype === "text/tab-separated-values") return true
  if (mimetype.startsWith("text/")) return true
  return false
}

/**
 * Extract structured contacts from an uploaded file.
 *
 * Strategy depends on the file type:
 * - XLSX / CSV / plain text — converted to CSV text and injected into the
 *   prompt (the LLM can't parse a binary spreadsheet as a vision attachment).
 * - PDF / image — passed as a vision attachment so the LLM can OCR it.
 */
export async function extractContactsFromFile(
  userId: string,
  file: { filename: string; mimetype: string; buffer: Buffer },
): Promise<ExtractedContact[]> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))

  let prompt = PROMPT
  let attachments: AnalyzeAttachment[] = []

  if (needsTextInline(file.filename, file.mimetype)) {
    const text = isXlsxFileName(file.filename) || isXlsxMimeType(file.mimetype)
      ? xlsxBufferToCsv(file.buffer)
      : file.buffer.toString("utf-8")
    // Cap the injected text — extraction quality drops on very large inputs
    // and some CLI providers have tight stdin limits.
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

  const response = await requestLLM(llmSettings, { prompt, schema: CONTACT_SCHEMA, attachments })
  if (response.error) throw new Error(response.error)

  const raw = response.output as { contacts?: unknown }
  const items = Array.isArray(raw.contacts) ? raw.contacts : []

  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null
  const asRole = (v: unknown): ExtractedContact["role"] => {
    const s = typeof v === "string" ? v.toLowerCase() : null
    return s === "client" || s === "supplier" || s === "both" ? s : null
  }
  const asKind = (v: unknown): ExtractedContact["kind"] => {
    const s = typeof v === "string" ? v.toLowerCase() : null
    return s === "company" || s === "person" ? s : null
  }
  const asNumber = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0

  const contacts: ExtractedContact[] = []
  for (const row of items) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const name = asString(r["name"])
    if (!name) continue
    contacts.push({
      name,
      email: asString(r["email"]),
      phone: asString(r["phone"]),
      mobile: asString(r["mobile"]),
      address: asString(r["address"]),
      city: asString(r["city"]),
      postalCode: asString(r["postalCode"]),
      province: asString(r["province"]),
      country: asString(r["country"]),
      taxId: asString(r["taxId"]),
      bankDetails: asString(r["bankDetails"]),
      notes: asString(r["notes"]),
      role: asRole(r["role"]),
      kind: asKind(r["kind"]),
      confidence: asNumber(r["confidence"]),
    })
  }

  return contacts
}
