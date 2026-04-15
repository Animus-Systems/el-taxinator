/**
 * Compat layer for @/actions/ai-import — calls Fastify import routes.
 */
import type { SuggestedCategory, TransactionCandidate } from "@/ai/import-csv"

type ImportSession = {
  data: TransactionCandidate[]
  suggestedCategories?: SuggestedCategory[]
}

type ImportResult = {
  success: boolean
  error?: string
  validationErrors?: Array<{
    rowIndex: number
    code: string
    message: string
  }>
  bank?: string
  bankConfidence?: number
  sessionId?: string
  session?: ImportSession
  created?: number
}

async function postFormData(url: string, formData: FormData): Promise<ImportResult> {
  try {
    const res = await fetch(url, { method: "POST", body: formData })
    return await res.json()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}

async function postJson(url: string, body?: unknown): Promise<ImportResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return await res.json()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}

export async function startCSVImportAction(formData: FormData): Promise<ImportResult> {
  return postFormData("/api/import/csv", formData)
}

export async function saveReviewSessionAction(
  sessionId: string,
  reviewedCandidates: TransactionCandidate[],
): Promise<ImportResult> {
  return postJson(`/api/import/session/${sessionId}/review`, { reviewedCandidates })
}

export async function categorizeSessionAction(
  sessionId: string,
  reviewedCandidates?: TransactionCandidate[],
): Promise<ImportResult> {
  return postJson(`/api/import/session/${sessionId}/categorize`, reviewedCandidates ? { reviewedCandidates } : undefined)
}

export async function detectPDFTypeAction(formData: FormData): Promise<ImportResult> {
  return postFormData("/api/import/pdf/detect", formData)
}

export async function extractPDFImportAction(formData: FormData): Promise<ImportResult> {
  return postFormData("/api/import/pdf/extract", formData)
}

export async function getImportSessionAction(sessionId: string): Promise<ImportResult> {
  try {
    const res = await fetch(`/api/import/session/${sessionId}`)
    return await res.json()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}

export async function recategorizeWithFeedbackAction(
  sessionId: string,
  feedback: string,
  reviewedCandidates?: TransactionCandidate[],
): Promise<ImportResult> {
  return postJson(`/api/import/session/${sessionId}/recategorize`, { feedback, reviewedCandidates })
}

export async function commitImportAction(
  sessionId: string,
  selectedRowIndexes: number[],
  reviewedCandidates?: TransactionCandidate[],
  acceptedCategories?: Array<{
    code: string
    name: { en: string; es: string }
    taxFormRef: string
    reason: string
  }>,
): Promise<ImportResult> {
  return postJson(`/api/import/session/${sessionId}/commit`, {
    selectedRowIndexes,
    reviewedCandidates,
    acceptedCategories,
  })
}

export async function cancelImportAction(sessionId: string): Promise<ImportResult> {
  try {
    const res = await fetch(`/api/import/session/${sessionId}`, { method: "DELETE" })
    return await res.json()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}
