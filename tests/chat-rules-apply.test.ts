import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pg", () => {
  const state = { rows: [] as Record<string, unknown>[], queries: [] as { text: string; values: unknown[] }[] }
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[]) => {
        state.queries.push({ text, values })
        const next = state.rows
        state.rows = []
        return { rows: next, rowCount: next.length }
      },
    }),
  }
})

import * as pg from "@/lib/pg"
import { applyRuleToExistingTransactions } from "@/models/rules"

function seedRows(rows: Record<string, unknown>[]) {
  ;(pg as unknown as { __state: { rows: Record<string, unknown>[]; queries: unknown[] } }).__state.rows = rows
}
function queries() {
  return (pg as unknown as { __state: { queries: { text: string; values: unknown[] }[] } }).__state.queries
}

const USER_ID = "00000000-0000-0000-0000-000000000001"

describe("applyRuleToExistingTransactions", () => {
  beforeEach(() => {
    ;(pg as unknown as { __state: { rows: Record<string, unknown>[]; queries: unknown[] } }).__state.queries = []
  })

  it("dry-run returns match count and sample IDs, does not write", async () => {
    seedRows([
      { id: "t1", merchant: "AWS cloud", category_code: "other", project_code: null, type: "expense" },
      { id: "t2", merchant: "uber eats", category_code: "other", project_code: null, type: "expense" },
      { id: "t3", merchant: "AWS billing", category_code: "software", project_code: null, type: "expense" },
    ])
    const result = await applyRuleToExistingTransactions(
      USER_ID,
      { matchType: "contains", matchField: "merchant", matchValue: "aws", categoryCode: "software" },
      { dryRun: true },
    )
    expect(result.matchCount).toBe(1) // t1 would change; t3 already has software; t2 doesn't match
    expect(result.sampleIds).toEqual(["t1"])
    expect(result.updated).toBe(0)
    expect(queries().every((q) => /SELECT/.test(q.text))).toBe(true)
  })

  it("applies update when not dry-run", async () => {
    seedRows([
      { id: "t1", merchant: "AWS cloud", category_code: "other", project_code: null, type: "expense" },
    ])
    const result = await applyRuleToExistingTransactions(
      USER_ID,
      { matchType: "contains", matchField: "merchant", matchValue: "aws", categoryCode: "software" },
      {},
    )
    expect(result.matchCount).toBe(1)
    expect(result.updated).toBe(1)
    expect(queries().some((q) => /UPDATE transactions/.test(q.text))).toBe(true)
    expect(queries().some((q) => /user_id =/.test(q.text))).toBe(true)
  })

  it("null rule targets never overwrite existing values", async () => {
    seedRows([
      { id: "t1", merchant: "AWS cloud", category_code: "software", project_code: "proj-a", type: "expense" },
    ])
    const result = await applyRuleToExistingTransactions(
      USER_ID,
      { matchType: "contains", matchField: "merchant", matchValue: "aws" },
      { dryRun: true },
    )
    expect(result.matchCount).toBe(0)
  })

  it("treats a null rule target as 'no change to this field'", async () => {
    seedRows([
      { id: "t1", merchant: "AWS cloud", category_code: "other", project_code: "proj-a", type: "expense" },
    ])
    const result = await applyRuleToExistingTransactions(
      USER_ID,
      {
        matchType: "contains", matchField: "merchant", matchValue: "aws",
        categoryCode: "software", projectCode: null,
      },
      { dryRun: true },
    )
    expect(result.matchCount).toBe(1)
  })
})
