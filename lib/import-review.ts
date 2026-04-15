export type TransactionReviewStatus =
  | "needs_review"
  | "business"
  | "business_non_deductible"
  | "personal_ignored"

type ReviewableCandidate = {
  rowIndex: number
  selected?: boolean
  status?: TransactionReviewStatus | null
  categoryCode?: string | null
  total?: number | null
  currencyCode?: string | null
}

export type ImportCommitValidationError = {
  rowIndex: number
  code: "needs_review" | "missing_category"
  message: string
}

export function validateImportCommit(candidates: ReviewableCandidate[]) {
  const errors: ImportCommitValidationError[] = []

  for (const candidate of candidates) {
    if (!candidate.selected) continue

    if (candidate.status === "needs_review" || candidate.status === null || candidate.status === undefined) {
      errors.push({
        rowIndex: candidate.rowIndex,
        code: "needs_review",
        message: "Selected rows must be reviewed before import.",
      })
      continue
    }

    const requiresCategory =
      candidate.status === "business" || candidate.status === "business_non_deductible"
    if (requiresCategory && !candidate.categoryCode) {
      errors.push({
        rowIndex: candidate.rowIndex,
        code: "missing_category",
        message: "Business rows must have a category before import.",
      })
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

type SummaryCounts = Record<TransactionReviewStatus, number>
type SummaryTotals = Record<TransactionReviewStatus, Record<string, number>>

export function summarizeImportCandidates(candidates: ReviewableCandidate[]): {
  counts: SummaryCounts
  totals: SummaryTotals
} {
  const counts: SummaryCounts = {
    needs_review: 0,
    business: 0,
    business_non_deductible: 0,
    personal_ignored: 0,
  }
  const totals: SummaryTotals = {
    needs_review: {},
    business: {},
    business_non_deductible: {},
    personal_ignored: {},
  }

  for (const candidate of candidates) {
    if (!candidate.selected) continue

    const status = candidate.status ?? "needs_review"
    counts[status] += 1

    if (candidate.total === null || candidate.total === undefined) continue

    const currencyCode = candidate.currencyCode ?? "UNKNOWN"
    totals[status][currencyCode] = (totals[status][currencyCode] ?? 0) + candidate.total
  }

  return { counts, totals }
}
