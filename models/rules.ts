import { sql, queryMany, queryOne, buildInsert, buildUpdate } from "@/lib/sql"
import type { CategorizationRule } from "@/lib/db-types"
import type { TransactionCandidate } from "@/ai/import-csv"
import { cache } from "react"

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface RuleCreateInput {
  name: string
  matchType?: string
  matchField?: string
  matchValue: string
  categoryCode?: string | null
  projectCode?: string | null
  type?: string | null
  status?: string | null
  note?: string | null
  priority?: number
  source?: string
  confidence?: number
  isActive?: boolean
}

export interface RuleUpdateInput {
  name?: string
  matchType?: string
  matchField?: string
  matchValue?: string
  categoryCode?: string | null
  projectCode?: string | null
  type?: string | null
  status?: string | null
  note?: string | null
  priority?: number
  confidence?: number
  isActive?: boolean
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getRules = cache(async (userId: string): Promise<CategorizationRule[]> => {
  return queryMany<CategorizationRule>(
    sql`SELECT * FROM categorization_rules
        WHERE user_id = ${userId}
        ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, priority DESC, created_at DESC
        LIMIT 1000`
  )
})

export const getActiveRules = cache(async (userId: string): Promise<CategorizationRule[]> => {
  return queryMany<CategorizationRule>(
    sql`SELECT * FROM categorization_rules
        WHERE user_id = ${userId} AND is_active = true
        ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, priority DESC, created_at DESC
        LIMIT 1000`
  )
})

export const getRuleById = async (id: string, userId: string): Promise<CategorizationRule | null> => {
  return queryOne<CategorizationRule>(
    sql`SELECT * FROM categorization_rules WHERE id = ${id} AND user_id = ${userId}`
  )
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createRule = async (userId: string, data: RuleCreateInput): Promise<CategorizationRule | null> => {
  return queryOne<CategorizationRule>(
    buildInsert("categorization_rules", {
      userId,
      name: data.name,
      matchType: data.matchType ?? "contains",
      matchField: data.matchField ?? "name",
      matchValue: data.matchValue,
      categoryCode: data.categoryCode ?? null,
      projectCode: data.projectCode ?? null,
      type: data.type ?? null,
      status: data.status ?? null,
      note: data.note ?? null,
      priority: data.priority ?? 0,
      source: data.source ?? "manual",
      confidence: data.confidence ?? 1.0,
      isActive: data.isActive ?? true,
    })
  )
}

export const updateRule = async (
  id: string,
  userId: string,
  data: RuleUpdateInput
): Promise<CategorizationRule | null> => {
  return queryOne<CategorizationRule>(
    buildUpdate(
      "categorization_rules",
      { ...data, updatedAt: new Date() },
      "id = $1 AND user_id = $2",
      [id, userId]
    )
  )
}

export const deleteRule = async (id: string, userId: string): Promise<CategorizationRule | null> => {
  return queryOne<CategorizationRule>(
    sql`DELETE FROM categorization_rules WHERE id = ${id} AND user_id = ${userId} RETURNING *`
  )
}

export const toggleRuleActive = async (
  id: string,
  userId: string,
  isActive: boolean
): Promise<CategorizationRule | null> => {
  return queryOne<CategorizationRule>(
    sql`UPDATE categorization_rules
        SET is_active = ${isActive}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *`
  )
}

// ---------------------------------------------------------------------------
// Rule matching helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if fieldValue matches the rule's matchType and matchValue.
 * All comparisons are case-insensitive where applicable.
 */
export function matchRule(matchType: string, matchValue: string, fieldValue: string | null): boolean {
  if (fieldValue === null || fieldValue === undefined) return false

  const field = fieldValue.toLowerCase()
  const value = matchValue.toLowerCase()

  switch (matchType) {
    case "contains":
      return field.includes(value)
    case "starts_with":
      return field.startsWith(value)
    case "exact":
      return field === value
    case "regex":
      try {
        return new RegExp(matchValue, "i").test(fieldValue)
      } catch {
        return false
      }
    default:
      return false
  }
}

/**
 * Applies categorization rules to an array of candidates in place.
 * Rules must be pre-sorted by priority (highest first).
 * First matching rule wins — breaks after first match.
 */
export function applyRulesToCandidates(
  candidates: TransactionCandidate[],
  rules: CategorizationRule[]
): void {
  const sortedRules = [...rules].sort((left, right) => {
    const leftManual = left.source === "manual" ? 0 : 1
    const rightManual = right.source === "manual" ? 0 : 1
    if (leftManual !== rightManual) return leftManual - rightManual
    if (left.priority !== right.priority) return right.priority - left.priority

    const leftTime = left.updatedAt?.getTime?.() ?? left.createdAt?.getTime?.() ?? 0
    const rightTime = right.updatedAt?.getTime?.() ?? right.createdAt?.getTime?.() ?? 0
    return rightTime - leftTime
  })

  for (const candidate of candidates) {
    for (const rule of sortedRules) {
      // Determine which field to match against
      let fieldValue: string | null
      switch (rule.matchField) {
        case "merchant":
          fieldValue = candidate.merchant
          break
        case "description":
          fieldValue = candidate.description
          break
        case "name":
        default:
          fieldValue = candidate.name
          break
      }

      if (!matchRule(rule.matchType, rule.matchValue, fieldValue)) continue

      // Apply rule values (only if rule has a value)
      if (rule.categoryCode) candidate.categoryCode = rule.categoryCode
      if (rule.projectCode) candidate.projectCode = rule.projectCode
      if (rule.type) candidate.type = rule.type
      if (rule.status) candidate.suggestedStatus = rule.status as TransactionCandidate["suggestedStatus"]

      // Set confidence based on source
      if (rule.source === "manual") {
        candidate.confidence = {
          category: candidate.categoryCode !== null ? 1 : 0,
          type: candidate.type !== null ? 1 : 0,
          status: candidate.suggestedStatus !== null ? 1 : 0,
          overall: 1,
        }
        candidate.ruleMatched = true
      } else {
        // Learned rule — use rule.confidence value
        const conf = rule.confidence
        candidate.confidence = {
          category: candidate.categoryCode !== null ? conf : 0,
          type: conf,
          status: candidate.suggestedStatus !== null ? conf : 0,
          overall: conf,
        }
      }

      // First rule wins
      break
    }
  }
}
