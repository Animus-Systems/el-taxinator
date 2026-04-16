import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"
import { normalizeVendorPattern } from "@/models/receipt-aliases"

export type ReceiptCandidate = {
  fileId: string
  vendor: string | null
  totalCents: number | null
  date: string | null
}

export type TransactionCandidate = {
  id: string
  name: string | null
  merchant: string | null
  totalCents: number
  date: string | null
  currencyCode: string | null
}

export type AliasEntry = {
  vendorPattern: string
  merchantPattern: string
}

export type ReceiptMatch = {
  fileId: string
  transactionId: string
  confidence: number
  reasoning: string
}

/**
 * Match extracted receipts to candidate expense transactions. Alias-first:
 * before calling the LLM, any receipt whose normalized vendor substring-matches
 * a stored alias AND whose amount/date align with exactly one transaction
 * (within tolerance) is pre-matched deterministically at confidence 0.95.
 * The remaining receipts + remaining transactions go to the LLM, seeded with
 * the top aliases as few-shot examples.
 */
export async function matchReceiptsToTransactions(
  receipts: ReceiptCandidate[],
  transactions: TransactionCandidate[],
  aliases: AliasEntry[],
  userId: string,
): Promise<ReceiptMatch[]> {
  if (receipts.length === 0 || transactions.length === 0) return []

  const matched: ReceiptMatch[] = []
  const consumedReceipts = new Set<string>()
  const consumedTransactions = new Set<string>()

  // Step 1: deterministic alias matches.
  for (const receipt of receipts) {
    if (!receipt.vendor || receipt.totalCents == null) continue
    const normalizedVendor = normalizeVendorPattern(receipt.vendor)

    const matchingAlias = aliases.find((alias) =>
      normalizedVendor.includes(alias.vendorPattern) ||
      alias.vendorPattern.includes(normalizedVendor),
    )
    if (!matchingAlias) continue

    const candidates = transactions.filter((tx) => {
      if (consumedTransactions.has(tx.id)) return false
      const normalizedMerchant = normalizeVendorPattern(tx.merchant ?? tx.name ?? "")
      if (
        !normalizedMerchant.includes(matchingAlias.merchantPattern) &&
        !matchingAlias.merchantPattern.includes(normalizedMerchant)
      ) return false
      // Amount tolerance: ±1 cent rounding, or same-sign close (≤3% diff).
      const diff = Math.abs(tx.totalCents - receipt.totalCents!)
      const tolerance = Math.max(1, Math.round(Math.abs(receipt.totalCents!) * 0.03))
      return diff <= tolerance
    })
    if (candidates.length !== 1) continue

    matched.push({
      fileId: receipt.fileId,
      transactionId: candidates[0]!.id,
      confidence: 0.95,
      reasoning: `alias: "${matchingAlias.vendorPattern}" → "${matchingAlias.merchantPattern}"`,
    })
    consumedReceipts.add(receipt.fileId)
    consumedTransactions.add(candidates[0]!.id)
  }

  const remainingReceipts = receipts.filter((r) => !consumedReceipts.has(r.fileId))
  const remainingTx = transactions.filter((t) => !consumedTransactions.has(t.id))
  if (remainingReceipts.length === 0 || remainingTx.length === 0) return matched

  // Step 2: LLM matches for the rest, seeded with alias examples.
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  const receiptLines = remainingReceipts.map((r) => ({
    fileId: r.fileId,
    vendor: r.vendor,
    totalCents: r.totalCents,
    date: r.date,
  }))
  const txLines = remainingTx.map((t) => ({
    id: t.id,
    merchant: t.merchant ?? t.name,
    totalCents: t.totalCents,
    date: t.date,
    currency: t.currencyCode,
  }))
  const aliasExamples = aliases.slice(0, 15).map((a) => ({
    vendor: a.vendorPattern,
    merchant: a.merchantPattern,
  }))

  const prompt = `Match each vendor RECEIPT below to the TRANSACTION that paid it. A receipt is the paper we keep to prove the expense; the transaction is the bank-account debit that already exists.

Consider:
- Date: the transaction should be within 0–45 days of the receipt date (the bank debit usually hits a few days after the purchase).
- Amount: the receipt total should equal or be very close to the transaction total (±3%).
- Vendor / merchant: the receipt's vendor name should match (even loosely) the transaction's merchant.

Rules:
- One receipt maps to AT MOST one transaction, and vice versa.
- If there is no plausible transaction for a receipt, OMIT that receipt from the matches array — do not invent.
- If you are unsure, still propose the pairing with LOW confidence (0.3–0.5) and a short reasoning. The human will review.

${aliasExamples.length > 0
  ? `Known vendor→merchant aliases (higher-signal hints; trust these substrings when present):\n${JSON.stringify(aliasExamples, null, 2)}\n`
  : ""}
RECEIPTS (amounts in cents):
${JSON.stringify(receiptLines, null, 2)}

TRANSACTIONS (amounts in cents):
${JSON.stringify(txLines, null, 2)}

Return ONLY valid JSON with this shape:
{
  "matches": [
    {
      "fileId": "<receipt fileId from list>",
      "transactionId": "<transaction id from list>",
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
            fileId: { type: "string" },
            transactionId: { type: "string" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: ["fileId", "transactionId", "confidence"],
        },
      },
    },
    required: ["matches"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema })
  if (response.error) throw new Error(response.error)

  const out = response.output as Record<string, unknown>
  const raw = Array.isArray(out["matches"]) ? (out["matches"] as Array<Record<string, unknown>>) : []

  const remainingReceiptIds = new Set(remainingReceipts.map((r) => r.fileId))
  const remainingTxIds = new Set(remainingTx.map((t) => t.id))

  for (const m of raw) {
    const fileId = typeof m["fileId"] === "string" ? m["fileId"] : null
    const transactionId = typeof m["transactionId"] === "string" ? m["transactionId"] : null
    const confidence = typeof m["confidence"] === "number" ? m["confidence"] : 0.5
    const reasoning = typeof m["reasoning"] === "string" ? m["reasoning"] : ""
    if (!fileId || !transactionId) continue
    if (!remainingReceiptIds.has(fileId) || !remainingTxIds.has(transactionId)) continue
    if (consumedReceipts.has(fileId) || consumedTransactions.has(transactionId)) continue
    matched.push({ fileId, transactionId, confidence, reasoning })
    consumedReceipts.add(fileId)
    consumedTransactions.add(transactionId)
  }

  return matched
}
