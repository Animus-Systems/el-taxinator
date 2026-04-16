import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"

export type MatchCandidateInvoice = {
  id: string
  number: string
  clientName: string | null
  issueDate: string
  totalCents: number
  allocatedCents: number
  notes: string | null
}

export type MatchCandidateTransaction = {
  id: string
  name: string | null
  merchant: string | null
  issuedAt: string | null
  totalCents: number
  type: string | null
  currencyCode: string | null
  allocatedCents: number
}

export type SuggestedMatch = {
  invoiceId: string
  transactionId: string
  amountCents: number
  confidence: number
  reasoning: string
}

export async function matchInvoicesToTransactions(
  invoices: MatchCandidateInvoice[],
  transactions: MatchCandidateTransaction[],
  userId: string,
): Promise<SuggestedMatch[]> {
  if (invoices.length === 0 || transactions.length === 0) return []

  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  // Trim payloads so we don't overshoot context on large corpora.
  const invLines = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    client: i.clientName,
    date: i.issueDate,
    outstandingCents: Math.max(i.totalCents - i.allocatedCents, 0),
    totalCents: i.totalCents,
    notes: i.notes?.slice(0, 120) ?? null,
  }))
  const txLines = transactions.map((t) => ({
    id: t.id,
    name: t.name,
    merchant: t.merchant,
    date: t.issuedAt,
    outstandingCents: Math.max(t.totalCents - t.allocatedCents, 0),
    totalCents: t.totalCents,
    type: t.type,
    currency: t.currencyCode,
  }))

  const prompt = `Match the invoices below to the transactions that paid them. Consider dates (payment usually happens 0-60 days after issue), amounts, and merchant/client names.

IMPORTANT:
- Many invoices CAN share one transaction — this is the cash-deposit case where the user brings several cash payments to the bank at once. Suggest several invoice→transaction rows using the same transactionId, with each "amountCents" equal to the outstanding balance of that invoice (they must sum to ≤ the transaction's outstandingCents).
- Never allocate more than an invoice's outstandingCents to a single transaction.
- Never let the total allocations against a single transaction exceed its outstandingCents.
- If you are unsure whether two things match, return a LOW confidence (0.2–0.5) but still propose the pairing — the human will review.
- Only skip if there is truly no plausible transaction (then omit that invoice).

INVOICES (amounts in cents):
${JSON.stringify(invLines, null, 2)}

TRANSACTIONS (amounts in cents):
${JSON.stringify(txLines, null, 2)}

Return ONLY valid JSON with this shape:
{
  "matches": [
    {
      "invoiceId": "<invoice id from list>",
      "transactionId": "<transaction id from list>",
      "amountCents": <integer cents>,
      "confidence": <0.0 to 1.0>,
      "reasoning": "<short why>"
    }
  ]
}`

  const schema = {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            invoiceId: { type: "string" },
            transactionId: { type: "string" },
            amountCents: { type: "number" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: ["invoiceId", "transactionId", "amountCents", "confidence"],
        },
      },
    },
    required: ["matches"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema })
  if (response.error) throw new Error(response.error)

  const out = response.output as Record<string, unknown>
  const raw = Array.isArray(out["matches"]) ? (out["matches"] as Array<Record<string, unknown>>) : []

  const invoiceIds = new Set(invoices.map((i) => i.id))
  const transactionIds = new Set(transactions.map((t) => t.id))

  const suggestions: SuggestedMatch[] = []
  for (const m of raw) {
    const invoiceId = typeof m["invoiceId"] === "string" ? m["invoiceId"] : null
    const transactionId = typeof m["transactionId"] === "string" ? m["transactionId"] : null
    const amountCents =
      typeof m["amountCents"] === "number" ? Math.round(m["amountCents"]) : null
    const confidence = typeof m["confidence"] === "number" ? m["confidence"] : 0.5
    const reasoning = typeof m["reasoning"] === "string" ? m["reasoning"] : ""
    if (!invoiceId || !transactionId || !amountCents || amountCents <= 0) continue
    if (!invoiceIds.has(invoiceId) || !transactionIds.has(transactionId)) continue
    suggestions.push({ invoiceId, transactionId, amountCents, confidence, reasoning })
  }
  return suggestions
}
