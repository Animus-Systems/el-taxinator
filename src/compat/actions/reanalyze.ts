/**
 * Client-side stub for @/actions/reanalyze server actions.
 */
import type { SuggestedCategory } from "@/ai/import-csv"

export type ReanalysisChange = {
  transactionId: string
  name?: string
  changed: boolean
  originalCategoryCode?: string | null
  suggestedCategoryCode?: string | null
  originalProjectCode?: string | null
  suggestedProjectCode?: string | null
  originalType?: string | null
  suggestedType?: string | null
}

export type ReanalysisResult = {
  transactionId: string
  transactionName?: string
  changes?: ReanalysisChange[]
  error?: string
  categoryCode?: string | null
  projectCode?: string | null
  type?: string | null
}

export async function reanalyzeTransactionsAction(
  _transactionIds: string[],
  _feedback?: string,
) {
  return {
    success: false as const,
    error: "Reanalysis is not yet available in SPA mode",
    changes: [] as ReanalysisChange[],
    suggestions: [] as SuggestedCategory[],
  }
}

export async function applyReanalysisAction(_results: ReanalysisResult[]) {
  return { success: false as const, error: "Reanalysis is not yet available in SPA mode" }
}
