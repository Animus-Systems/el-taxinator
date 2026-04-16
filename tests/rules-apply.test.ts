import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type QueryCall = { sql: string; params: unknown[] }
const calls: QueryCall[] = []
const mockQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>>()

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return mockQuery(sql, params)
    },
  })),
}))

import { recordRuleApplication } from "@/models/rules"

describe("recordRuleApplication", () => {
  beforeEach(() => {
    calls.length = 0
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("no-ops on empty map without issuing a query", async () => {
    await recordRuleApplication("user-1", new Map())
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("issues one UPDATE per unique rule id and increments by the counted amount", async () => {
    const counts = new Map<string, number>([
      ["rule-a", 5],
      ["rule-b", 12],
    ])
    await recordRuleApplication("user-1", counts)

    expect(mockQuery).toHaveBeenCalledTimes(2)
    for (const call of calls) {
      expect(call.sql).toContain("UPDATE categorization_rules")
      expect(call.sql).toContain("match_count = match_count +")
      expect(call.sql).toContain("last_applied_at = CURRENT_TIMESTAMP")
    }

    const paramsA = calls.find((c) => c.params.includes("rule-a"))!.params
    expect(paramsA).toContain(5)
    expect(paramsA).toContain("user-1")

    const paramsB = calls.find((c) => c.params.includes("rule-b"))!.params
    expect(paramsB).toContain(12)
  })

  it("scopes updates by user_id so one user cannot bump another user's counters", async () => {
    await recordRuleApplication("user-xyz", new Map([["rule-42", 1]]))

    const call = calls[0]
    expect(call).toBeDefined()
    expect(call!.sql).toContain("WHERE id =")
    expect(call!.sql).toContain("user_id =")
    expect(call!.params).toContain("user-xyz")
    expect(call!.params).toContain("rule-42")
  })
})
