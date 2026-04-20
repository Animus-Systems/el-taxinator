/**
 * Heuristic transaction-type classifier.
 *
 * Input: a transaction's description / merchant / name / amount sign.
 * Output: the best-matching type (or null when nothing matches strongly).
 *
 * Used by the "Reclassify types" reconcile-style tool to propose fixes for
 * historical rows that predate the current taxonomy (income, expense, refund,
 * transfer, exchange, other). Deterministic, local, free — no AI calls.
 *
 * Design notes:
 *  - Refund / exchange / transfer get precedence over income/expense because
 *    they're the common mis-classifications (a refund landing in the account
 *    looks like income if the AI only sees the sign).
 *  - Patterns are case-insensitive and cover Spanish + English.
 *  - Income/expense from sign is only applied when the current type is null
 *    or obviously wrong — we don't flip existing income↔expense without a
 *    strong signal.
 */

export type ClassifiedType = "income" | "expense" | "refund" | "transfer" | "exchange" | "other"

type Signals = {
  name: string | null
  merchant: string | null
  description: string | null
  /** Signed cents — positive = money in, negative = money out. */
  total: number | null
  type: string | null
}

/** Combined case-insensitive search text for pattern matching. */
function searchText(s: Signals): string {
  return [s.name, s.merchant, s.description]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" ")
    .toLowerCase()
}

/** Spanish + English refund cues. The money can go either way (client refund
 *  leaves the account; supplier refund returns). We only set `refund` here —
 *  sign/direction logic handled downstream. */
const REFUND_RE = /\b(refund|refunded|reembolso|devoluci[oó]n|devuelto|chargeback|refund\s+credit|credit\s+memo|cr[eé]dito\s+(de\s+)?devoluci[oó]n)\b/i

/** In-account FX operations (old `conversion` label). */
const EXCHANGE_RE =
  /\b(exchanged\s+to|exchange\s+from|converted\s+to|currency\s+(?:conversion|exchange)|fx\s*[-/]?\s*[a-z]{3}|cambio\s+de\s+divisa)\b/i

/** Inter-account moves — user's own accounts, standing orders, SEPA
 *  transfers with the bank's generic label, etc. Order of specificity:
 *  "TRANSFERENCIA INTERNA" / "OWN TRANSFER" > "TRANSFERENCIA" / "TRANSF" /
 *  "giro". Keep broad enough to catch bank-template descriptions. */
const TRANSFER_RE =
  /\b(transferencia|transf(?:\.|er)?\b|giro|own\s+transfer|internal\s+transfer|a\s+mi\s+cuenta|from\s+my\s+account|to\s+my\s+account|mov\.?\s+entre\s+cuentas)\b/i

/**
 * Returns a suggested type and an optional reason string explaining why. Null
 * means "the current type looks fine — nothing worth suggesting". The caller
 * filters out suggestions that match the row's existing type.
 */
export function classifyTransaction(s: Signals): {
  suggested: ClassifiedType
  reason: string
} | null {
  const hay = searchText(s)

  // 1. Refund patterns win first — they look like income/expense on the
  //    surface but semantically are reversals.
  if (REFUND_RE.test(hay)) {
    return { suggested: "refund", reason: "Description matches refund pattern." }
  }

  // 2. In-account FX exchanges. The old taxonomy stored these as
  //    `conversion` — the v34 migration already renamed them — but any rows
  //    that slipped through as `income`/`expense` still need catching.
  if (EXCHANGE_RE.test(hay)) {
    return { suggested: "exchange", reason: "Description matches currency-exchange pattern." }
  }

  // 3. Inter-account transfers.
  if (TRANSFER_RE.test(hay)) {
    return { suggested: "transfer", reason: "Description matches transfer/giro pattern." }
  }

  // 4. Sign-based income/expense — only when the current type is missing or
  //    demonstrably wrong (income row with negative value, etc.).
  const currentType = s.type
  const sign = s.total ?? 0
  if (sign > 0 && currentType !== "income" && currentType !== "refund" && currentType !== "transfer" && currentType !== "exchange") {
    if (currentType === null || currentType === "other" || currentType === "expense") {
      return { suggested: "income", reason: "Positive amount with no better match." }
    }
  }
  if (sign < 0 && currentType !== "expense" && currentType !== "refund" && currentType !== "transfer" && currentType !== "exchange") {
    if (currentType === null || currentType === "other" || currentType === "income") {
      return { suggested: "expense", reason: "Negative amount with no better match." }
    }
  }

  return null
}
