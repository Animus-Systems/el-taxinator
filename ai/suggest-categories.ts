import { requestLLM } from "./providers/llmProvider"
import { getLLMSettings, getSettings } from "@/models/settings"
import { getCategories } from "@/models/categories"
import type { TransactionCandidate, SuggestedCategory } from "./import-csv"

export async function suggestNewCategories(
  candidates: TransactionCandidate[],
  userId: string,
): Promise<SuggestedCategory[]> {
  // Filter to uncategorized or low-confidence candidates (< 0.5)
  const uncategorized = candidates.filter(
    (c) => !c.categoryCode || c.confidence.category < 0.5,
  )

  // If fewer than 2 uncategorized, return empty array (not worth suggesting)
  if (uncategorized.length < 2) {
    return []
  }

  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)
  const categories = await getCategories(userId)

  const transactionLines = uncategorized
    .map(
      (c) =>
        `[${c.rowIndex}] ${c.name ?? "(no name)"} | ${c.merchant ?? "(no merchant)"} | ${c.type ?? "?"} | ${c.total !== null ? (c.total / 100).toFixed(2) : "?"}`,
    )
    .join("\n")

  const categoryLines =
    categories.length > 0
      ? categories
          .map((c) => {
            const name =
              typeof c.name === "string"
                ? c.name
                : (c.name as { en?: string })?.en ?? String(c.name)
            return `${c.code}: ${name}`
          })
          .join("\n")
      : "(none)"

  const prompt = `You are analyzing bank transactions for a Canary Islands freelancer.

These transactions could NOT be confidently categorized into existing categories:
${transactionLines}

Existing categories:
${categoryLines}

If you see 2+ transactions that would benefit from a NEW category that doesn't exist yet, suggest it. For each provide:
- code: snake_case identifier
- name: bilingual { en, es }
- taxFormRef: relevant Canary Islands tax form reference
- reason: why, mentioning matching transactions
- affectedRowIndexes: which transaction indexes would use it

Be conservative — only suggest when clearly beneficial. Do NOT suggest categories that already exist.`

  const schema = {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            name: {
              type: "object",
              properties: {
                en: { type: "string" },
                es: { type: "string" },
              },
              required: ["en", "es"],
            },
            taxFormRef: { type: "string" },
            reason: { type: "string" },
            affectedRowIndexes: {
              type: "array",
              items: { type: "number" },
            },
          },
          required: ["code", "name", "taxFormRef", "reason", "affectedRowIndexes"],
        },
      },
    },
    required: ["suggestions"],
  }

  try {
    const response = await requestLLM(llmSettings, { prompt, schema })

    if (response.error) {
      console.error("suggestNewCategories LLM error:", response.error)
      return []
    }

    const output = response.output as { suggestions?: unknown[] }
    if (!Array.isArray(output.suggestions)) {
      return []
    }

    return output.suggestions as SuggestedCategory[]
  } catch (err) {
    console.error("suggestNewCategories failed:", err)
    return []
  }
}
