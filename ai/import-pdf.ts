import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"
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
  const llmSettings = getLLMSettings(settings)

  const prompt = `Look at this PDF. Is it a bank statement (contains a TABLE of multiple transactions with dates, descriptions, and amounts) or a single receipt/invoice?

Return ONLY: {"type": "bank_statement"} or {"type": "receipt"}`

  const schema = {
    type: "object",
    properties: { type: { type: "string", enum: ["bank_statement", "receipt"] } },
    required: ["type"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema, attachments })
  if (response.error) return "receipt" // default to receipt on error
  return (response.output as Record<string, string>).type === "bank_statement" ? "bank_statement" : "receipt"
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
  const llmSettings = getLLMSettings(settings)
  const categories = await getCategories(userId)
  const projects = await getProjects(userId)

  const categoryList = categories.map(c => `${c.code}: ${c.name}`).join("\n")
  const projectList = projects.map(p => `${p.code}: ${p.name}`).join("\n")

  const prompt = `Extract ALL transactions from this bank statement PDF. For each transaction, extract:
- date (ISO format yyyy-MM-dd)
- name/description
- merchant (if identifiable)
- amount (positive number in the currency's smallest unit, e.g. cents)
- type: "expense" or "income"
- suggested categoryCode from the list below (or null)
- suggested projectCode from the list below (or null)
- suggested status: "business", "business_non_deductible", "personal_ignored", or null if unsure

Also identify the bank name from the document header/branding.

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
            type: { type: "string" },
            categoryCode: { type: ["string", "null"] },
            projectCode: { type: ["string", "null"] },
            status: {
              type: ["string", "null"],
              enum: ["business", "business_non_deductible", "personal_ignored", null],
            },
            confidence: { type: "number" },
          },
          required: ["date", "name", "amount", "type"],
        },
      },
    },
    required: ["bank", "transactions"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema, attachments })
  if (response.error) throw new Error(response.error)

  const output = response.output as Record<string, unknown>
  const transactions = output.transactions as Array<Record<string, unknown>>
  const currency = (output.currency as string) || defaultCurrency

  const candidates: TransactionCandidate[] = transactions.map((t, idx) => ({
    rowIndex: idx,
    name: (t.name as string) || null,
    merchant: (t.merchant as string) || null,
    description: null,
    total: typeof t.amount === "number" ? Math.round(t.amount) : null,
    currencyCode: currency,
    type: (t.type as string) || "expense",
    categoryCode: (t.categoryCode as string) || null,
    projectCode: (t.projectCode as string) || null,
    accountId: null,
    issuedAt: (t.date as string) || null,
    status: "needs_review",
    suggestedStatus:
      t.status === "business" ||
      t.status === "business_non_deductible" ||
      t.status === "personal_ignored"
        ? t.status
        : null,
    confidence: {
      category: (t.confidence as number) || 0.5,
      type: 0.8,
      status: (t.confidence as number) || 0.5,
      overall: (t.confidence as number) || 0.5,
    },
    selected: true,
  }))

  return {
    bank: (output.bank as string) || "Unknown",
    bankConfidence: (output.bankConfidence as number) || 0.5,
    candidates,
  }
}
