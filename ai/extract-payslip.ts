import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"
import type { AnalyzeAttachment } from "./attachments"

/**
 * AI-extracted Spanish nómina (payslip) fields.
 *
 * Amounts in euros (pre-cents); converted to cents at the call site. All
 * fields are suggestions — the user confirms before the server persists.
 */
export type ExtractedPayslip = {
  employerName: string | null
  employerTaxId: string | null
  periodStart: string | null   // ISO yyyy-MM-dd
  periodEnd: string | null     // ISO yyyy-MM-dd
  gross: number | null         // devengado bruto
  net: number | null           // líquido a percibir
  irpfWithheld: number | null
  ssEmployee: number | null    // SS contribution by the worker
  currency: string | null
  confidence: number
}

export async function extractPayslipFromFile(
  attachments: AnalyzeAttachment[],
  userId: string,
): Promise<ExtractedPayslip> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  const prompt = `Look at this Spanish payslip (nómina) and extract the fields below.

Rules:
- "employerName" is the company that pays the worker (empresa / pagador). Prefer the trading name over a legal suffix.
- "employerTaxId" is the employer's NIF / CIF.
- "periodStart" and "periodEnd" are the ISO dates (yyyy-MM-dd) of the pay period (e.g. 2026-03-01 to 2026-03-31).
- "gross" is the TOTAL DEVENGADO / SALARIO BRUTO — the total accrued amount before deductions. Decimal in euros.
- "net" is the LÍQUIDO A PERCIBIR / NETO A PAGAR — what actually arrives in the bank account.
- "irpfWithheld" is the IRPF retention line (retención IRPF).
- "ssEmployee" is the Seguridad Social deduction from the worker's pay (aportación del trabajador: contingencias comunes + desempleo + formación).
- "currency" defaults to "EUR".
- "confidence" is 0–1 overall.

Return ONLY valid JSON. Use null for any field you cannot determine confidently.`

  const schema = {
    type: "object",
    properties: {
      employerName: { type: ["string", "null"] },
      employerTaxId: { type: ["string", "null"] },
      periodStart: { type: ["string", "null"] },
      periodEnd: { type: ["string", "null"] },
      gross: { type: ["number", "null"] },
      net: { type: ["number", "null"] },
      irpfWithheld: { type: ["number", "null"] },
      ssEmployee: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
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
    employerName: asString(out["employerName"]),
    employerTaxId: asString(out["employerTaxId"]),
    periodStart: asString(out["periodStart"]),
    periodEnd: asString(out["periodEnd"]),
    gross: asNumber(out["gross"]),
    net: asNumber(out["net"]),
    irpfWithheld: asNumber(out["irpfWithheld"]),
    ssEmployee: asNumber(out["ssEmployee"]),
    currency: asString(out["currency"])?.toUpperCase() ?? null,
    confidence: asNumber(out["confidence"]) ?? 0,
  }
}
