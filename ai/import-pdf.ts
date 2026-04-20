import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings, preferSonnetForVision } from "@/models/settings"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import type { TransactionCandidate } from "./import-csv"
import type { AnalyzeAttachment } from "./attachments"

/**
 * Detect whether a PDF is a bank statement (tabular) or a receipt/invoice (single transaction).
 */
export async function detectPDFType(
  attachments: AnalyzeAttachment[],
  userId: string,
): Promise<"bank_statement" | "receipt"> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))

  const prompt = `Look at this PDF. Is it a bank statement (contains a TABLE of multiple transactions with dates, descriptions, and amounts) or a single receipt/invoice?

Return ONLY: {"type": "bank_statement"} or {"type": "receipt"}`

  const schema = {
    type: "object",
    properties: { type: { type: "string", enum: ["bank_statement", "receipt"] } },
    required: ["type"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema, attachments })
  if (response.error) return "receipt" // default to receipt on error
  return (response.output as Record<string, string>)["type"] === "bank_statement" ? "bank_statement" : "receipt"
}

/**
 * Extract transactions from a bank statement PDF using vision.
 */
export async function extractPDFTransactions(
  attachments: AnalyzeAttachment[],
  userId: string,
  defaultCurrency: string,
): Promise<{ bank: string; bankConfidence: number; candidates: TransactionCandidate[] }> {
  const settings = await getSettings(userId)
  const llmSettings = preferSonnetForVision(getLLMSettings(settings))
  const categories = await getCategories(userId)
  const projects = await getProjects(userId)

  const categoryList = categories.map(c => `${c.code}: ${c.name}`).join("\n")
  const projectList = projects.map(p => `${p.code}: ${p.name}`).join("\n")

  const prompt = `Extract ALL transactions from this bank statement PDF. For each transaction, extract:
- date (ISO format yyyy-MM-dd)
- name/description
- merchant (if identifiable)
- amount (positive number in the currency's smallest unit, e.g. cents)
- currency: the ISO-4217 3-letter code shown for THAT specific line (e.g. "EUR", "USD", "GBP", "PLN"). Multi-currency statements (e.g. Revolut) commonly list transactions in different currencies — do NOT assume the statement-level currency applies to every row. Leave currency null only when no per-row currency is discernible.
- type: "expense" or "income"
- suggested categoryCode from the list below (or null)
- suggested projectCode from the list below (or null)
- suggested status: "business", "business_non_deductible", "personal_taxable", "personal_ignored", "internal", or null if unsure. Use "personal_taxable" for crypto disposals / staking rewards / airdrops / stock dividends (personal but Modelo-100 taxable); use "personal_ignored" for bank-side counter-legs of crypto disposals and mistaken deposits; use "internal" for own-account transfers and in-account FX conversions (mechanical book moves, not personal).

Also identify the bank name from the document header/branding and the statement-level default currency.

Categories:\n${categoryList || "(none - leave null)"}
Projects:\n${projectList || "(none - leave null)"}

Return ONLY valid JSON:
{
  "bank": "bank name",
  "bankConfidence": 0.0-1.0,
  "currency": "${defaultCurrency}",
  "transactions": [
    {
      "date": "2026-01-15",
      "name": "description",
      "merchant": "merchant or null",
      "amount": 1250,
      "currency": "EUR",
      "type": "expense",
      "categoryCode": "code_or_null",
      "projectCode": "code_or_null",
      "status": "business_or_null",
      "confidence": 0.0-1.0
    }
  ]
}`

  const schema = {
    type: "object",
    properties: {
      bank: { type: "string" },
      bankConfidence: { type: "number" },
      currency: { type: "string" },
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            name: { type: "string" },
            merchant: { type: ["string", "null"] },
            amount: { type: "number" },
            currency: { type: ["string", "null"] },
            type: { type: "string" },
            categoryCode: { type: ["string", "null"] },
            projectCode: { type: ["string", "null"] },
            status: {
              type: ["string", "null"],
              enum: [
                "business",
                "business_non_deductible",
                "personal_taxable",
                "personal_ignored",
                "internal",
                null,
              ],
            },
            confidence: { type: "number" },
          },
          required: ["date", "name", "amount", "type"],
        },
      },
    },
    required: ["bank", "transactions"],
  }

  // Walk the configured provider chain on 0-row results. A valid JSON envelope
  // with an empty transactions array is a soft failure: either the model
  // skipped reading the file (observed with Claude Opus in CLI -p mode, where
  // it's more agentic) or the vision pass genuinely found no rows. We can't
  // tell the two apart from a single response, so we treat 0 rows as a reason
  // to try the next provider in the fallback list. The built-in requestLLM
  // fallback only fires on hard errors; this loop covers soft failures too.
  let output: Record<string, unknown> = {}
  let transactions: Array<Record<string, unknown>> = []
  let bankName = ""
  let bankConfidence = 0

  const providerChain = llmSettings.providers
  const attemptsBudget = Math.max(2, providerChain.length)
  for (let attempt = 0; attempt < attemptsBudget; attempt++) {
    const attemptSettings: typeof llmSettings =
      attempt < providerChain.length
        ? { ...llmSettings, providers: providerChain.slice(attempt) }
        : llmSettings // budget overrun → retry on the primary
    const response = await requestLLM(attemptSettings, { prompt, schema, attachments })
    if (response.error) throw new Error(response.error)
    output = response.output as Record<string, unknown>
    transactions = (output["transactions"] as Array<Record<string, unknown>> | undefined) ?? []
    bankName = typeof output["bank"] === "string" ? (output["bank"] as string) : ""
    bankConfidence =
      typeof output["bankConfidence"] === "number" ? (output["bankConfidence"] as number) : 0

    if (transactions.length > 0) {
      if (attempt > 0) {
        console.info(
          `[extractPDFTransactions] recovered on attempt ${attempt + 1}: ${transactions.length} row(s), bank="${bankName}" conf=${bankConfidence}`,
        )
      }
      break
    }
    console.warn(
      `[extractPDFTransactions] attempt ${attempt + 1}/${attemptsBudget} returned 0 rows (bank="${bankName}" conf=${bankConfidence}) — trying next provider`,
    )
  }

  const currency = (output["currency"] as string) || defaultCurrency

  const candidates: TransactionCandidate[] = transactions.map((t, idx) => {
    const rawCurrency = t["currency"]
    const rowCurrency =
      typeof rawCurrency === "string" && /^[A-Za-z]{3}$/.test(rawCurrency)
        ? rawCurrency.toUpperCase()
        : null
    return {
    rowIndex: idx,
    name: (t["name"] as string) || null,
    merchant: (t["merchant"] as string) || null,
    description: null,
    total: typeof t["amount"] === "number" ? Math.round(t["amount"] as number) : null,
    currencyCode: rowCurrency ?? currency,
    type: (t["type"] as string) || "expense",
    categoryCode: (t["categoryCode"] as string) || null,
    projectCode: (t["projectCode"] as string) || null,
    accountId: null,
    issuedAt: (t["date"] as string) || null,
    status: "needs_review",
    suggestedStatus:
      t["status"] === "business" ||
      t["status"] === "business_non_deductible" ||
      t["status"] === "personal_taxable" ||
      t["status"] === "personal_ignored" ||
      t["status"] === "internal"
        ? (t["status"] as
            | "business"
            | "business_non_deductible"
            | "personal_taxable"
            | "personal_ignored"
            | "internal")
        : null,
    confidence: {
      category: (t["confidence"] as number) || 0.5,
      type: 0.8,
      status: (t["confidence"] as number) || 0.5,
      overall: (t["confidence"] as number) || 0.5,
    },
    selected: true,
    }
  })

  return {
    bank: bankName || "Unknown",
    bankConfidence: bankConfidence || 0.5,
    candidates,
  }
}
