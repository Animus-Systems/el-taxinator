/**
 * Unified AI matcher that pairs transactions with invoices AND purchases.
 *
 * Rules wired into the prompt:
 *   - invoices pair with income transactions (revenue side)
 *   - purchases pair with expense transactions (cost side)
 *   - currency must match (no GBP invoice → EUR transaction)
 *   - cash aggregation: one transaction can cover multiple documents
 *     (user deposits €500 cash covering 4 small invoices; user withdraws
 *      €200 to pay 3 cash suppliers)
 *   - the AI sees amounts in major units (60.00 means sixty), never raw cents
 */
import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"

export type DocKind = "invoice" | "purchase"

export type MatchCandidateDocument = {
  id: string
  /** 'invoice' = factura emitida (revenue). 'purchase' = factura recibida (cost). */
  kind: DocKind
  /** Display number (invoice.number or purchase.supplierInvoiceNumber). */
  number: string
  /** Counterparty name — client for invoices, supplier for purchases. */
  contactName: string | null
  /** ISO date string (yyyy-MM-dd). */
  issueDate: string
  totalCents: number
  allocatedCents: number
  currencyCode: string
  notes: string | null
}

export type MatchCandidateTransaction = {
  id: string
  name: string | null
  merchant: string | null
  issuedAt: string | null
  totalCents: number
  /** 'income' pairs only with invoices, 'expense' only with purchases. */
  type: string | null
  currencyCode: string | null
  allocatedCents: number
}

export type SuggestedMatch = {
  documentId: string
  documentKind: DocKind
  transactionId: string
  amountCents: number
  confidence: number
  reasoning: string
}

/** Strip common bank-statement cruft so a transaction description reads like
 * a real name, not a telex. Leaves the useful fragment intact. Kept simple —
 * more aggressive cleanup risks eating genuine identifiers. */
function cleanBankDescription(raw: string | null): string | null {
  if (!raw) return raw
  const cleaned = raw
    .replace(/TRANSF(?:\.|ERENCIA)?\s+(?:GIRO\s+)?(?:NACIONAL|INMEDIATA|SEPA|RECIBIDA|EMITIDA)?\s*[-·:]?\s*/gi, "")
    .replace(/PAGO\s+(?:CON\s+)?(?:TARJETA|TRANSFERENCIA)\s*[-·:]?\s*/gi, "")
    .replace(/ADEUDO\s+(?:DOMICILIADO)?\s*[-·:]?\s*/gi, "")
    .replace(/INGRESO\s+(?:EN\s+EFECTIVO)?\s*[-·:]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return cleaned || raw
}

export async function matchDocumentsToTransactions(
  documents: MatchCandidateDocument[],
  transactions: MatchCandidateTransaction[],
  userId: string,
): Promise<SuggestedMatch[]> {
  if (documents.length === 0 || transactions.length === 0) return []

  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  const toMajor = (cents: number): number => Math.round(cents) / 100

  const docLines = documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    number: d.number,
    contact: d.contactName,
    date: d.issueDate,
    outstanding: toMajor(Math.max(d.totalCents - d.allocatedCents, 0)),
    total: toMajor(d.totalCents),
    currency: d.currencyCode,
    notes: d.notes?.slice(0, 120) ?? null,
  }))

  const txLines = transactions.map((t) => ({
    id: t.id,
    name: cleanBankDescription(t.name),
    merchant: t.merchant,
    date: t.issuedAt,
    outstanding: toMajor(Math.max(t.totalCents - t.allocatedCents, 0)),
    total: toMajor(t.totalCents),
    type: t.type,
    currency: t.currencyCode,
  }))

  const prompt = `Match documents (invoices and purchases) to the bank transactions that settled them.

DIRECTION RULES:
- Normal payments: invoice ↔ income transaction, purchase ↔ expense transaction
- REFUNDS are cross-direction and legal:
  - invoice ↔ expense: user paid a client back (invoice was refunded)
  - purchase ↔ income: supplier paid the user back (purchase was refunded)
  Prefer the normal direction; only propose a refund pairing when the
  amount/name/date strongly suggests a reversal (e.g. exact same amount,
  merchant name matches, reasoning like "refund" / "devolución" in the
  transaction description). Mark refund matches with lower confidence
  (0.5–0.7) unless the evidence is overwhelming.
- currencies MUST match: don't pair a GBP invoice with an EUR transaction

AMOUNT RULES:
- All amounts are major units with two decimals — 60.00 means sixty euros, NOT six thousand
- Never allocate more than a document's outstanding to a single transaction
- Never let total allocations against a single transaction exceed its outstanding

CASH AGGREGATION (important — happens in both directions):
- Several invoices CAN share one income transaction. This is the "cash deposit" case: the user brings a week of small cash payments to the bank at once. Emit one row per invoice, all pointing to the same transactionId, amounts summing to ≤ the transaction's outstanding.
- Several purchases CAN share one expense transaction. This is the "cash withdrawal" case: the user takes €500 from an ATM and pays 4 suppliers in cash. Same pattern.

TIMING:
- Payments usually land 0–60 days after invoice issue. Transactions older than 120 days are almost never matches — skip them.

CONFIDENCE:
- Exact-amount, exact-date, name-matches → 0.85–0.95
- Amount matches, name plausible, date within a week → 0.6–0.8
- Approximate match (cash aggregation, fuzzy name) → 0.3–0.5
- Use your "reasoning" in the same units: write "€60.00", never "6000 EUR"

DOCUMENTS:
${JSON.stringify(docLines, null, 2)}

TRANSACTIONS:
${JSON.stringify(txLines, null, 2)}

Return ONLY valid JSON:
{
  "matches": [
    {
      "documentId": "<id from DOCUMENTS>",
      "documentKind": "invoice" | "purchase",
      "transactionId": "<id from TRANSACTIONS>",
      "amount": <decimal, major units, e.g. 60.00>,
      "confidence": <0.0 to 1.0>,
      "reasoning": "<short, include currency symbol>"
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
            documentId: { type: "string" },
            documentKind: { type: "string", enum: ["invoice", "purchase"] },
            transactionId: { type: "string" },
            amount: { type: "number" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: [
            "documentId",
            "documentKind",
            "transactionId",
            "amount",
            "confidence",
          ],
        },
      },
    },
    required: ["matches"],
  }

  const response = await requestLLM(llmSettings, { prompt, schema })
  if (response.error) throw new Error(response.error)

  const out = response.output as Record<string, unknown>
  const raw = Array.isArray(out["matches"]) ? (out["matches"] as Array<Record<string, unknown>>) : []

  const docById = new Map(documents.map((d) => [d.id, d]))
  const txById = new Map(transactions.map((t) => [t.id, t]))

  const suggestions: SuggestedMatch[] = []
  for (const m of raw) {
    const documentId = typeof m["documentId"] === "string" ? m["documentId"] : null
    const documentKind = m["documentKind"] === "invoice" || m["documentKind"] === "purchase"
      ? (m["documentKind"] as DocKind)
      : null
    const transactionId = typeof m["transactionId"] === "string" ? m["transactionId"] : null
    const amountCents =
      typeof m["amount"] === "number"
        ? Math.round(m["amount"] * 100)
        : typeof m["amountCents"] === "number"
          ? Math.round(m["amountCents"])
          : null
    const confidence = typeof m["confidence"] === "number" ? m["confidence"] : 0.5
    const reasoning = typeof m["reasoning"] === "string" ? m["reasoning"] : ""
    if (!documentId || !documentKind || !transactionId) continue
    if (!amountCents || amountCents <= 0) continue
    const doc = docById.get(documentId)
    const tx = txById.get(transactionId)
    if (!doc || !tx) continue
    // Keep the hard constraints: doc kind must agree with what the AI wrote,
    // and currencies must match. Direction is advisory now (cross-direction
    // = refunds are legal) so we don't filter on type.
    if (doc.kind !== documentKind) continue
    if (doc.currencyCode && tx.currencyCode && doc.currencyCode !== tx.currencyCode) continue
    suggestions.push({
      documentId,
      documentKind,
      transactionId,
      amountCents,
      confidence,
      reasoning,
    })
  }
  return suggestions
}
