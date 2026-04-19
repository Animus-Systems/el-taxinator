import { requestLLM } from "./providers/llmProvider"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import { getSettings, getLLMSettings } from "@/models/settings"
import { getActiveRules } from "@/models/rules"
import type { Category, Project, I18nText } from "@/lib/db-types"
import type { TransactionReviewStatus } from "@/lib/import-review"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CandidateCryptoMeta = {
  asset?: string
  quantity?: string
  pricePerUnit?: number | null
  costBasisPerUnit?: number | null
  costBasisSource?: "manual" | "fifo" | "imported"
  realizedGainCents?: number | null
  fxRate?: number | null
  gatewayTransactionId?: string | null
  fingerprint?: string | null
}

// AI-proposed pairing between two candidate legs of an own-account transfer.
// `rowIndexB` is null when only one leg is visible (orphan transfer).
// `counterAccountId` is the AI's best guess at which of the user's existing
// accounts is the other end of an orphan transfer; the UI uses it as a default
// when asking the user to pick a counter-account manually.
export type ProposedTransferLink = {
  rowIndexA: number
  rowIndexB: number | null
  confidence: number
  reason: string
  counterAccountId?: string | null
}

export type TransactionCandidate = {
  rowIndex: number
  name: string | null
  merchant: string | null
  description: string | null
  total: number | null // in cents
  currencyCode: string | null
  type: string | null // "expense" | "income"
  categoryCode: string | null
  projectCode: string | null
  accountId: string | null
  issuedAt: string | null // ISO date string
  status: TransactionReviewStatus
  suggestedStatus: TransactionReviewStatus | null
  // Snapshot of the AI's initial categorization (captured once, after the
  // first categorize pass). Compared against the user's final choice at
  // commit time to auto-learn recurring corrections into
  // `categorization_rules`. Undefined means "never captured".
  suggestedCategoryCode?: string | null
  suggestedProjectCode?: string | null
  suggestedType?: string | null
  confidence: {
    category: number
    type: number
    status: number
    overall: number
  }
  selected: boolean
  ruleMatched?: boolean
  matchedRuleId?: string | null
  // `extra.crypto` is populated by the wizard when the AI identifies a crypto
  // disposal/purchase/reward. Phase 1 accepts partial metadata; unknown fields
  // (e.g. missing cost basis) keep the candidate in `needs_review`.
  extra?: {
    crypto?: CandidateCryptoMeta
    proposedTransferLink?: ProposedTransferLink
    // Set by the import pipeline when a candidate matches an existing
    // transaction in the user's ledger. The candidate is auto-deselected
    // so duplicates don't get re-committed unless the user re-enables them.
    duplicateOfId?: string | null
    [key: string]: unknown
  }
  // Populated by `wizard.applyTransferLink` when the user confirms a transfer
  // link proposed by the AI. `transferId` is a shared UUID across both legs
  // (null for orphan / unpaired legs). `transferDirection` records which leg
  // this row represents so the commit loop can persist the correct columns.
  transferId?: string | null
  transferDirection?: "outgoing" | "incoming" | null
  // Populated by `wizard.applyTransferLink` for orphan transfers when the
  // user picks which of their existing accounts is the counter-party. Flows
  // straight through to `transactions.counter_account_id` at commit time.
  counterAccountId?: string | null
  // Populated by `wizard.applyBulkAction` when the action carries a
  // `createIncomeSource` payload — the server upserts the income source and
  // stamps its id here so the row links to the source on commit.
  incomeSourceId?: string | null
}

export type SuggestedCategory = {
  code: string
  name: { en: string; es: string }
  taxFormRef: string
  reason: string
  affectedRowIndexes: number[]
}

export type CSVColumnMapping = {
  bank: string
  bankConfidence: number
  columnMapping: Record<string, string>
  dateFormat: string
  amountFormat: "negative_expense" | "separate_columns" | "absolute_with_type"
  skipRows: number[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function i18nToString(value: I18nText): string {
  if (typeof value === "string") return value
  return value["en"] || Object.values(value)[0] || ""
}

function formatCategoryList(categories: Category[]): string {
  return categories
    .map((c) => `- code: "${c.code}", name: "${i18nToString(c.name)}"`)
    .join("\n")
}

function formatProjectList(projects: Project[]): string {
  return projects
    .map((p) => `- code: "${p.code}", name: "${i18nToString(p.name)}"`)
    .join("\n")
}

function parseAmount(raw: string): number | null {
  if (!raw || raw.trim() === "") return null
  // Remove currency symbols, spaces, and thousands separators, but keep minus and decimal
  const cleaned = raw.replace(/[^0-9.,\-+]/g, "").trim()

  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null

  // Handle European format (1.234,56) vs US format (1,234.56)
  const hasCommaDecimal = /\d,\d{1,2}$/.test(cleaned)
  const hasDotDecimal = /\d\.\d{1,2}$/.test(cleaned)

  let normalized: string
  if (hasCommaDecimal && !hasDotDecimal) {
    // European: remove dots (thousands), replace comma with dot (decimal)
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else {
    // US or unambiguous: remove commas (thousands)
    normalized = cleaned.replace(/,/g, "")
  }

  const value = parseFloat(normalized)
  if (isNaN(value)) return null

  // Convert to cents
  return Math.round(value * 100)
}

// ---------------------------------------------------------------------------
// 1. detectCSVMapping
// ---------------------------------------------------------------------------

export async function detectCSVMapping(
  headers: string[],
  sampleRows: string[][],
  userId: string
): Promise<CSVColumnMapping> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)
  const [categories, projects] = await Promise.all([
    getCategories(userId),
    getProjects(userId),
  ])

  const sampleData = sampleRows.slice(0, 5)

  const prompt = `You are analyzing a CSV file from a bank or financial institution to map its columns to transaction fields.

CSV Headers: ${JSON.stringify(headers)}

Sample data rows (first ${sampleData.length}):
${sampleData.map((row, i) => `Row ${i}: ${JSON.stringify(row)}`).join("\n")}

Available categories:
${categories.length > 0 ? formatCategoryList(categories) : "(none defined)"}

Available projects:
${projects.length > 0 ? formatProjectList(projects) : "(none defined)"}

Analyze this CSV and determine:
1. Which bank or institution this CSV likely comes from
2. How each CSV column maps to our transaction fields: name, merchant, description, total, currencyCode, type, issuedAt
   PLUS — when this is a crypto exchange statement — the crypto-specific fields:
   cryptoAsset, cryptoQuantity, cryptoGrossAmountEur, cryptoFeeEur

Crypto exchanges (Swissborg, Kraken, Coinbase, Binance, Bitstamp, Bit2Me, Revolut Crypto) use different column shapes than banks. Typical columns:
- "Type" — values like "Sell", "Buy", "Deposit", "Withdrawal", "Payouts", "Fee Adjustment", "Redemption".
- "Currency" — the crypto asset ticker (BORG, ETH, BTC, SOL, etc.) — NOT an ISO fiat code.
- "Gross amount", "Net amount" — in the asset currency.
- "Gross amount (EUR)", "Net amount (EUR)" — EUR-equivalent for tax reporting.
- "Fee", "Fee (EUR)" — transaction fees.
- "Note" — free-text description like "Exchanged to EUR", "Alpha redemption".

When the CSV is a crypto-exchange statement, in addition to the regular bank mappings you MUST capture crypto-specific data by mapping these extra fields:
- The asset ticker column ("Currency" in SwissBorg) → \`cryptoAsset\`
- The per-asset quantity column ("Gross amount" in SwissBorg) → \`cryptoQuantity\`
- The EUR-equivalent of the gross amount ("Gross amount (EUR)") → \`cryptoGrossAmountEur\`
- The EUR fee column ("Fee (EUR)") → \`cryptoFeeEur\` (optional, skip if not present)

These feed the FIFO cost-basis ledger and /crypto page. Without them, crypto tax reporting silently breaks.

Also:
- Map the EUR-denominated net amount column (e.g. "Net amount (EUR)") to \`total\`.
- Set currencyCode to the literal "EUR" via the const: synthesized-value form (see below) — the \`Currency\` column is the asset ticker, NOT the fiat code.
- If there's no natural "name" or "merchant" column, use synthesized values (below) to produce something readable in the UI.

Constant / synthesized values. When a field value isn't in a single column, you may return one of these special forms as the mapping value:
- "const:<literal>" — use the literal string for every row. E.g. \`"merchant": "const:SwissBorg"\` sets merchant to "SwissBorg" on every row.
- "concat:<Column A>+<Column B>" — concatenate two column values with a space. E.g. \`"name": "concat:Type+Currency"\` produces "Sell BORG", "Buy EUR", etc.

Prefer mapping a real column when possible. Only use const: or concat: when no single column represents the field.

3. The date format used (e.g. "yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy")
4. How amounts are represented:
   - "negative_expense": negative values are expenses, positive are income
   - "separate_columns": expenses and income are in separate columns
   - "absolute_with_type": amounts are always positive with a separate type/direction column
5. Any rows in the sample that should be skipped (summary rows, totals, etc.)

For columnMapping, map CSV column names to our field names. Only include columns that have a clear mapping. If a column maps to "total" but contains expenses in a separate column, use the format "total:expense" or "total:income" for separate_columns format.

Example — Swissborg crypto CSV:
Headers: ["Local time","Time in UTC","Type","Currency","Gross amount","Gross amount (EUR)","Fee","Fee (EUR)","Net amount","Net amount (EUR)","Note"]
Good mapping:
{
  "Time in UTC": "issuedAt",
  "Net amount (EUR)": "total",
  "Note": "description",
  "Type": "type",
  "Currency": "cryptoAsset",
  "Gross amount": "cryptoQuantity",
  "Gross amount (EUR)": "cryptoGrossAmountEur",
  "Fee (EUR)": "cryptoFeeEur",
  "currencyCode": "const:EUR",
  "name": "concat:Type+Currency",
  "merchant": "const:SwissBorg"
}

Note the last three entries are "virtual" mappings — the key side of the mapping object can be the LITERAL field name (e.g. "name", "merchant", "currencyCode") when using const: or concat: because there's no real CSV column on that side.`

  const schema = {
    type: "object",
    properties: {
      bank: { type: "string", description: "Detected bank or institution name" },
      bankConfidence: {
        type: "number",
        description: "Confidence in bank detection, 0 to 1",
      },
      columnMapping: {
        type: "object",
        description:
          "Maps CSV column names to transaction fields (name, merchant, description, total, currencyCode, type, issuedAt). For separate_columns amount format, use total:expense and total:income as values. For crypto exchange statements, ALSO map these fields when present: cryptoAsset (ticker column), cryptoQuantity (asset-denominated amount), cryptoGrossAmountEur (EUR-denominated gross), cryptoFeeEur (EUR fee). Values may also be synthesized directives: 'const:<literal>' (fixed value for every row) or 'concat:<ColA>+<ColB>' (joins two columns with a space). When using const: or concat:, the key side may be the literal field name (e.g. 'merchant', 'currencyCode', 'name') since there's no corresponding CSV column.",
        additionalProperties: { type: "string" },
      },
      dateFormat: {
        type: "string",
        description: "The date format used, e.g. yyyy-MM-dd, MM/dd/yyyy",
      },
      amountFormat: {
        type: "string",
        enum: ["negative_expense", "separate_columns", "absolute_with_type"],
        description: "How amounts are represented in the CSV",
      },
      skipRows: {
        type: "array",
        items: { type: "number" },
        description:
          "Indexes of sample rows that should be skipped (summary/total rows)",
      },
    },
    required: [
      "bank",
      "bankConfidence",
      "columnMapping",
      "dateFormat",
      "amountFormat",
      "skipRows",
    ],
    additionalProperties: false,
  }

  const response = await requestLLM(llmSettings, { prompt, schema })

  if (response.error) {
    // Return a sensible default on failure so the caller can still proceed
    return {
      bank: "Unknown",
      bankConfidence: 0,
      columnMapping: {},
      dateFormat: "yyyy-MM-dd",
      amountFormat: "negative_expense",
      skipRows: [],
    }
  }

  const output = response.output as Record<string, unknown>

  return {
    bank: (output["bank"] as string) || "Unknown",
    bankConfidence:
      typeof output["bankConfidence"] === "number" ? output["bankConfidence"] : 0,
    columnMapping: (output["columnMapping"] as Record<string, string>) || {},
    dateFormat: (output["dateFormat"] as string) || "yyyy-MM-dd",
    amountFormat:
      (output["amountFormat"] as CSVColumnMapping["amountFormat"]) ||
      "negative_expense",
    skipRows: Array.isArray(output["skipRows"])
      ? (output["skipRows"] as number[])
      : [],
  }
}

// ---------------------------------------------------------------------------
// 2. applyCSVMapping
// ---------------------------------------------------------------------------

export function applyCSVMapping(
  headers: string[],
  rows: string[][],
  mapping: CSVColumnMapping,
  defaultCurrency: string
): TransactionCandidate[] {
  const { columnMapping, amountFormat, skipRows } = mapping

  // Build a reverse map: transaction field -> column index
  const fieldToIndex: Record<string, number> = {}
  // For separate_columns: track expense and income column indexes
  let expenseColIndex = -1
  let incomeColIndex = -1

  // Collect synthetic rules alongside the column-index mappings.
  const syntheticFields: Record<
    string,
    { kind: "const"; value: string } | { kind: "concat"; cols: number[] }
  > = {}

  for (const [csvCol, field] of Object.entries(columnMapping)) {
    // Normalize: the "field" side may be a real field name OR a synth directive.
    const fieldLower = field.toLowerCase()
    if (fieldLower.startsWith("const:")) {
      // csvCol here is the target field name (e.g. "merchant")
      syntheticFields[csvCol] = { kind: "const", value: field.slice("const:".length) }
      continue
    }
    if (fieldLower.startsWith("concat:")) {
      const cols = field
        .slice("concat:".length)
        .split("+")
        .map((c) => c.trim())
        .map((c) => headers.indexOf(c))
        .filter((i) => i >= 0)
      syntheticFields[csvCol] = { kind: "concat", cols }
      continue
    }

    const colIndex = headers.indexOf(csvCol)
    if (colIndex === -1) continue

    if (field === "total:expense") {
      expenseColIndex = colIndex
    } else if (field === "total:income") {
      incomeColIndex = colIndex
    } else {
      fieldToIndex[field] = colIndex
    }
  }

  const skipSet = new Set(skipRows)
  const candidates: TransactionCandidate[] = []

  for (let i = 0; i < rows.length; i++) {
    if (skipSet.has(i)) continue

    const row = rows[i]
    if (!row || row.every((cell) => cell.trim() === "")) continue

    const getValue = (field: string): string | null => {
      const idx = fieldToIndex[field]
      if (idx !== undefined && idx >= 0 && idx < row.length) {
        const val = row[idx]?.trim()
        if (val !== undefined && val !== "") return val
      }
      const synth = syntheticFields[field]
      if (synth) {
        if (synth.kind === "const") return synth.value
        if (synth.kind === "concat") {
          const parts = synth.cols
            .map((i) => (i >= 0 && i < row.length ? row[i]?.trim() : ""))
            .filter((s): s is string => !!s && s.length > 0)
          if (parts.length > 0) return parts.join(" ")
        }
      }
      return null
    }

    // Parse amount and determine type
    let total: number | null = null
    let type: string | null = null

    if (amountFormat === "separate_columns") {
      const expenseRaw =
        expenseColIndex >= 0 && expenseColIndex < row.length
          ? row[expenseColIndex]?.trim()
          : null
      const incomeRaw =
        incomeColIndex >= 0 && incomeColIndex < row.length
          ? row[incomeColIndex]?.trim()
          : null

      const expenseAmt = expenseRaw ? parseAmount(expenseRaw) : null
      const incomeAmt = incomeRaw ? parseAmount(incomeRaw) : null

      if (incomeAmt !== null && incomeAmt !== 0) {
        total = Math.abs(incomeAmt)
        type = "income"
      } else if (expenseAmt !== null) {
        total = Math.abs(expenseAmt)
        type = "expense"
      }
    } else if (amountFormat === "absolute_with_type") {
      const rawTotal = getValue("total")
      total = rawTotal ? parseAmount(rawTotal) : null
      if (total !== null) total = Math.abs(total)
      const rawType = getValue("type")
      if (rawType) {
        const lower = rawType.toLowerCase()
        if (
          lower.includes("income") ||
          lower.includes("credit") ||
          lower.includes("deposit")
        ) {
          type = "income"
        } else {
          type = "expense"
        }
      }
    } else {
      // negative_expense (default)
      const rawTotal = getValue("total")
      const parsed = rawTotal ? parseAmount(rawTotal) : null
      if (parsed !== null) {
        if (parsed < 0) {
          total = Math.abs(parsed)
          type = "expense"
        } else {
          total = parsed
          type = "income"
        }
      }
    }

    const candidate: TransactionCandidate = {
      rowIndex: i,
      name: getValue("name"),
      merchant: getValue("merchant"),
      description: getValue("description"),
      total,
      currencyCode: getValue("currencyCode") || defaultCurrency,
      type,
      categoryCode: null,
      projectCode: null,
      accountId: null,
      issuedAt: getValue("issuedAt"),
      status: "needs_review",
      suggestedStatus: null,
      confidence: {
        category: 0.5,
        type: type !== null ? 0.8 : 0.5,
        status: 0,
        overall: 0.5,
      },
      selected: true,
    }

    // Crypto columns → candidate.extra.crypto. When the mapping captured the
    // asset ticker column, derive partial FIFO metadata at mapping time so
    // the wizard and the /crypto page have structured data even if the AI
    // never thinks to emit extra.crypto itself. pricePerUnit is the EUR-per-
    // unit ratio; costBasisPerUnit stays null for disposals (FIFO populates
    // it later) and is set equal to pricePerUnit for purchases.
    const cryptoAsset = getValue("cryptoAsset")
    const cryptoQuantityRaw = getValue("cryptoQuantity")
    const cryptoGrossEurRaw = getValue("cryptoGrossAmountEur")
    const cryptoFeeEurRaw = getValue("cryptoFeeEur")
    if (cryptoAsset && cryptoAsset.trim() !== "") {
      const qtyParsed = cryptoQuantityRaw ? Number(cryptoQuantityRaw.replace(",", ".")) : null
      const grossEurCents = cryptoGrossEurRaw ? parseAmount(cryptoGrossEurRaw) : null
      const feeEurCents = cryptoFeeEurRaw ? parseAmount(cryptoFeeEurRaw) : null
      const pricePerUnitCents =
        qtyParsed !== null && grossEurCents !== null && qtyParsed > 0
          ? Math.round(grossEurCents / qtyParsed)
          : null
      candidate.extra = {
        ...(candidate.extra ?? {}),
        crypto: {
          asset: cryptoAsset.trim().toUpperCase(),
          ...(qtyParsed !== null && Number.isFinite(qtyParsed)
            ? { quantity: String(qtyParsed) }
            : {}),
          ...(pricePerUnitCents !== null ? { pricePerUnit: pricePerUnitCents } : {}),
          ...(feeEurCents !== null ? { feesCents: feeEurCents } : {}),
        } as Record<string, unknown>,
      }
    }

    candidates.push(candidate)
  }

  return candidates
}

// ---------------------------------------------------------------------------
// 3. categorizeTransactions
// ---------------------------------------------------------------------------

const CATEGORIZE_BATCH_SIZE = 50

/**
 * Internal categorization logic shared by public functions.
 * When `feedback` is provided, it is appended to each batch prompt.
 */
async function categorizeTransactionsInternal(
  candidates: TransactionCandidate[],
  userId: string,
  feedback?: string,
): Promise<void> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)
  const [categories, projects, rules] = await Promise.all([
    getCategories(userId),
    getProjects(userId),
    getActiveRules(userId),
  ])

  if (categories.length === 0 && projects.length === 0) return

  const categoryCodes = categories.map((c) => c.code)
  const projectCodes = projects.map((p) => p.code)

  // Build rules context string for the prompt
  const rulesContext = rules.length > 0
    ? `\n\nThe user has categorization rules (DO NOT contradict manual rules):\n${rules.map(r => `- If ${r.matchField} ${r.matchType} "${r.matchValue}" → category: ${r.categoryCode || "auto"}, project: ${r.projectCode || "auto"}, type: ${r.type || "auto"}, status: ${r.status || "auto"} [${r.source}]`).join("\n")}`
    : ""

  const feedbackContext = feedback
    ? `\n\nUser feedback (apply these instructions):\n${feedback}`
    : ""

  // Only send candidates not already matched by a manual rule
  const uncategorized = candidates.filter((c) => !c.ruleMatched)

  for (let i = 0; i < uncategorized.length; i += CATEGORIZE_BATCH_SIZE) {
    const batch = uncategorized.slice(i, i + CATEGORIZE_BATCH_SIZE)

    const transactionsForPrompt = batch.map((c, idx) => ({
      index: idx,
      name: c.name,
      merchant: c.merchant,
      description: c.description,
      total: c.total !== null ? (c.total / 100).toFixed(2) : null,
      type: c.type,
      issuedAt: c.issuedAt,
    }))

    const prompt = `You are categorizing bank transactions. For each transaction, suggest the best matching category, project, type, and business treatment status.

Available categories:
${categories.length > 0 ? formatCategoryList(categories) : "(none)"}

Available projects:
${projects.length > 0 ? formatProjectList(projects) : "(none)"}${rulesContext}

Transactions to categorize:
${JSON.stringify(transactionsForPrompt, null, 2)}

For each transaction, return:
- categoryCode: the best matching category code, or null if unsure
- projectCode: the best matching project code, or null if unsure
- type: "expense" or "income"
- status: "business", "business_non_deductible", "personal_taxable", "personal_ignored", or null if unsure. "personal_taxable" = crypto disposals/staking/airdrops/dividends (personal, Modelo 100 taxable). "personal_ignored" = own-account transfers, bank-side disposal legs, mistaken deposits.
- confidence: 0 to 1, how confident you are in the categorization${feedbackContext}`

    const schema = {
      type: "object",
      properties: {
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              categoryCode: {
                type: ["string", "null"],
              },
              projectCode: {
                type: ["string", "null"],
              },
              type: { type: "string", enum: ["expense", "income"] },
              status: {
                type: ["string", "null"],
                enum: [
                  "business",
                  "business_non_deductible",
                  "personal_taxable",
                  "personal_ignored",
                  null,
                ],
              },
              confidence: { type: "number" },
            },
            required: [
              "index",
              "categoryCode",
              "projectCode",
              "type",
              "status",
              "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["transactions"],
      additionalProperties: false,
    }

    try {
      const response = await requestLLM(llmSettings, { prompt, schema })

      if (response.error) {
        console.error(
          `Categorization batch ${i / CATEGORIZE_BATCH_SIZE} failed:`,
          response.error
        )
        continue
      }

      const output = response.output as {
        transactions?: Array<{
          index: number
          categoryCode: string | null
          projectCode: string | null
          type: string
          status: TransactionReviewStatus | null
          confidence: number
        }>
      }

      if (!Array.isArray(output.transactions)) continue

      for (const result of output.transactions) {
        if (
          typeof result.index !== "number" ||
          result.index < 0 ||
          result.index >= batch.length
        )
          continue

        const candidate = batch[result.index]
        if (!candidate) continue

        candidate.categoryCode =
          result.categoryCode && categoryCodes.includes(result.categoryCode)
            ? result.categoryCode
            : null

        candidate.projectCode =
          result.projectCode && projectCodes.includes(result.projectCode)
            ? result.projectCode
            : null

        if (result.type === "expense" || result.type === "income") {
          candidate.type = result.type
        }

        candidate.suggestedStatus =
          result.status === "business" ||
          result.status === "business_non_deductible" ||
          result.status === "personal_taxable" ||
          result.status === "personal_ignored"
            ? result.status
            : null

        const conf =
          typeof result.confidence === "number"
            ? Math.max(0, Math.min(1, result.confidence))
            : 0.5

        candidate.confidence = {
          category: candidate.categoryCode !== null ? conf : 0,
          type: conf,
          status: candidate.suggestedStatus !== null ? conf : 0,
          overall: conf,
        }
      }
    } catch (err) {
      console.error(
        `Categorization batch ${i / CATEGORIZE_BATCH_SIZE} error:`,
        err
      )
      // Silently skip failed batch - user can categorize manually
    }
  }
}

export async function categorizeTransactions(
  candidates: TransactionCandidate[],
  userId: string,
): Promise<void> {
  return categorizeTransactionsInternal(candidates, userId)
}

export async function categorizeTransactionsWithFeedback(
  candidates: TransactionCandidate[],
  userId: string,
  feedback: string,
): Promise<void> {
  return categorizeTransactionsInternal(candidates, userId, feedback)
}
