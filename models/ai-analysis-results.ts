import { sql, queryMany, queryOne, execute } from "@/lib/sql"
import type { AiAnalysisResult } from "@/lib/db-types"

export type RecordAnalysisInput = {
  userId: string
  sessionId: string | null
  rowIndex: number | null
  provider: string
  model: string | null
  promptVersion: string
  reasoning: string | null
  categoryCode: string | null
  projectCode: string | null
  suggestedStatus: string | null
  confidence: { category: number; type: number; status: number; overall: number }
  clarifyingQuestion: string | null
  tokensUsed: number | null
}

export async function recordAnalysis(input: RecordAnalysisInput): Promise<AiAnalysisResult> {
  const confidenceJson = JSON.stringify(input.confidence)

  const row = await queryOne<AiAnalysisResult>(
    sql`INSERT INTO ai_analysis_results (
          user_id, session_id, row_index, provider, model, prompt_version,
          reasoning, category_code, project_code, suggested_status,
          confidence, clarifying_question, tokens_used
        )
        VALUES (
          ${input.userId}, ${input.sessionId}, ${input.rowIndex}, ${input.provider},
          ${input.model}, ${input.promptVersion}, ${input.reasoning},
          ${input.categoryCode}, ${input.projectCode}, ${input.suggestedStatus},
          ${confidenceJson}::jsonb, ${input.clarifyingQuestion}, ${input.tokensUsed}
        )
        RETURNING *`,
  )
  if (!row) throw new Error("recordAnalysis: insert returned no row")
  return row
}

export async function linkSessionRowToTransaction(
  sessionId: string,
  rowIndex: number,
  transactionId: string,
): Promise<number> {
  return execute(
    sql`UPDATE ai_analysis_results
        SET transaction_id = ${transactionId}
        WHERE session_id = ${sessionId} AND row_index = ${rowIndex}`,
  )
}

export async function listAnalysisForSession(
  sessionId: string,
  userId: string,
): Promise<AiAnalysisResult[]> {
  return queryMany<AiAnalysisResult>(
    sql`SELECT * FROM ai_analysis_results
        WHERE session_id = ${sessionId} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1000`,
  )
}

export async function listAnalysisForTransaction(
  transactionId: string,
  userId: string,
): Promise<AiAnalysisResult[]> {
  return queryMany<AiAnalysisResult>(
    sql`SELECT * FROM ai_analysis_results
        WHERE transaction_id = ${transactionId} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 100`,
  )
}
