import { describe, expect, it, vi, beforeEach } from "vitest"

const createRuleMock = vi.fn()
const updateRuleMock = vi.fn()
const getActiveRulesMock = vi.fn()

vi.mock("@/models/rules", () => ({
  getActiveRules: (userId: string) => getActiveRulesMock(userId),
  createRule: (userId: string, data: unknown) => createRuleMock(userId, data),
  updateRule: (id: string, userId: string, data: unknown) =>
    updateRuleMock(id, userId, data),
}))

import { learnFromImport } from "@/ai/learn-rules"
import type { TransactionCandidate } from "@/ai/import-csv"

function fxCandidate(rowIndex: number, type: string): TransactionCandidate {
  return {
    rowIndex,
    name: `British Pound · GBP → Euro · EUR revolut row ${rowIndex}`,
    merchant: "Revolut",
    description: null,
    total: 30000 + rowIndex,
    currencyCode: "EUR",
    type,
    categoryCode: null,
    projectCode: null,
    accountId: null,
    issuedAt: "2026-02-20",
    status: "internal",
    suggestedStatus: null,
    confidence: { category: 0.5, type: 0.8, status: 0.8, overall: 0.7 },
    selected: true,
  }
}

describe("learnFromImport — type corrections", () => {
  beforeEach(() => {
    createRuleMock.mockReset()
    updateRuleMock.mockReset()
    getActiveRulesMock.mockResolvedValue([])
  })

  it("learns a rule from 3+ type-only corrections (transfer → exchange)", async () => {
    // Original AI suggestion was 'transfer' for each row — user corrected to
    // 'exchange' for all four. Category and project stayed null the whole
    // time, so the learner only sees a type change.
    const originals = [
      { rowIndex: 1, categoryCode: null, projectCode: null, type: "transfer" },
      { rowIndex: 2, categoryCode: null, projectCode: null, type: "transfer" },
      { rowIndex: 15, categoryCode: null, projectCode: null, type: "transfer" },
      { rowIndex: 16, categoryCode: null, projectCode: null, type: "transfer" },
    ]
    const finals = [1, 2, 15, 16].map((i) => fxCandidate(i, "exchange"))

    const result = await learnFromImport("user-1", originals, finals)

    expect(result).toBe(1)
    expect(createRuleMock).toHaveBeenCalledTimes(1)
    const [, data] = createRuleMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(data["type"]).toBe("exchange")
    expect(data["categoryCode"]).toBeNull()
    expect(data["projectCode"]).toBeNull()
    expect(data["source"]).toBe("learned")
    // Common pattern should be a word shared by all four names — the longest
    // candidate is "pound" / "euro" / "revolut" depending on tokenisation.
    expect(typeof data["matchValue"]).toBe("string")
  })

  it("does not learn from a lone type correction (needs 3+ of the same target)", async () => {
    const originals = [
      { rowIndex: 0, categoryCode: null, projectCode: null, type: "transfer" },
    ]
    const finals = [fxCandidate(0, "exchange")]

    const result = await learnFromImport("user-1", originals, finals)

    expect(result).toBe(0)
    expect(createRuleMock).not.toHaveBeenCalled()
  })
})
