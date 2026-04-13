import { getActiveRules, createRule, updateRule } from "@/models/rules"
import type { TransactionCandidate } from "./import-csv"
import type { CategorizationRule } from "@/lib/db-types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OriginalSuggestion {
  rowIndex: number
  categoryCode: string | null
  projectCode: string | null
  type: string | null
}

interface Correction {
  rowIndex: number
  name: string | null
  merchant: string | null
  fromCategory: string | null
  fromProject: string | null
  toCategory: string | null
  toProject: string | null
}

// ---------------------------------------------------------------------------
// findCommonSubstring
// ---------------------------------------------------------------------------

/**
 * Finds the longest word (3+ chars) that appears in ALL strings.
 * Returns null if no common word is found.
 */
export function findCommonSubstring(strings: string[]): string | null {
  if (strings.length === 0) return null
  if (strings.length === 1) return strings[0]

  // Split each string into words with 3+ chars (case-insensitive comparison)
  const wordSets = strings.map((s) => {
    const words = s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3)
    return new Set(words)
  })

  // Get words from the first string and check which appear in ALL others
  const [first, ...rest] = wordSets
  const common: string[] = []
  for (const word of first) {
    if (rest.every((set) => set.has(word))) {
      common.push(word)
    }
  }

  if (common.length === 0) return null

  // Return the longest common word
  return common.reduce((a, b) => (a.length >= b.length ? a : b))
}

// ---------------------------------------------------------------------------
// learnFromImport
// ---------------------------------------------------------------------------

/**
 * Analyzes user corrections made during import review and auto-creates or
 * updates "learned" categorization rules for recurring patterns.
 *
 * Returns the number of rules created or updated.
 */
export async function learnFromImport(
  userId: string,
  originalSuggestions: OriginalSuggestion[],
  finalCandidates: TransactionCandidate[]
): Promise<number> {
  // Build a map of original suggestions by rowIndex for fast lookup
  const originalsMap = new Map<number, OriginalSuggestion>()
  for (const orig of originalSuggestions) {
    originalsMap.set(orig.rowIndex, orig)
  }

  // Identify corrections: selected candidates where category/project changed
  const corrections: Correction[] = []
  for (const candidate of finalCandidates) {
    if (!candidate.selected) continue

    const original = originalsMap.get(candidate.rowIndex)
    if (!original) continue

    const categoryChanged = candidate.categoryCode !== original.categoryCode
    const projectChanged = candidate.projectCode !== original.projectCode

    if (categoryChanged || projectChanged) {
      corrections.push({
        rowIndex: candidate.rowIndex,
        name: candidate.name,
        merchant: candidate.merchant,
        fromCategory: original.categoryCode,
        fromProject: original.projectCode,
        toCategory: candidate.categoryCode,
        toProject: candidate.projectCode,
      })
    }
  }

  // Need at least 3 corrections to learn anything
  if (corrections.length < 3) return 0

  // Group corrections by target category+project key
  const groups = new Map<string, Correction[]>()
  for (const correction of corrections) {
    const key = `${correction.toCategory ?? "null"}|${correction.toProject ?? "null"}`
    const group = groups.get(key)
    if (group) {
      group.push(correction)
    } else {
      groups.set(key, [correction])
    }
  }

  // Load existing learned rules once for comparison
  const existingRules = await getActiveRules(userId)
  const learnedRules = existingRules.filter((r: CategorizationRule) => r.source === "learned")

  let rulesAffected = 0

  for (const [key, group] of groups) {
    // Only process groups with 3+ corrections
    if (group.length < 3) continue

    // Collect non-null names for pattern detection
    const names = group.map((c) => c.name).filter((n): n is string => n !== null && n.trim() !== "")
    if (names.length < 3) continue

    // Find common pattern among transaction names
    const commonPattern = findCommonSubstring(names)
    if (!commonPattern) continue

    // Parse the group key back to category/project
    const [toCategory, toProject] = key.split("|")
    const categoryCode = toCategory === "null" ? null : toCategory
    const projectCode = toProject === "null" ? null : toProject

    // Confidence proportional to group size, capped at 0.9
    const confidence = Math.min(0.5 + group.length / 10, 0.9)

    // Check if a learned rule already exists for this pattern
    const existingRule = learnedRules.find(
      (r: CategorizationRule) =>
        r.matchField === "name" &&
        r.matchValue.toLowerCase() === commonPattern.toLowerCase()
    )

    if (existingRule) {
      // Update existing learned rule
      await updateRule(existingRule.id, userId, {
        categoryCode,
        projectCode,
        confidence,
      })
      rulesAffected++
    } else {
      // Create new learned rule
      await createRule(userId, {
        name: `Learned: ${commonPattern}`,
        matchType: "contains",
        matchField: "name",
        matchValue: commonPattern,
        categoryCode,
        projectCode,
        source: "learned",
        confidence,
        isActive: true,
      })
      rulesAffected++
    }
  }

  return rulesAffected
}
