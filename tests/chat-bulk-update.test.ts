import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pg", () => {
  const state = {
    rowQueue: [] as Record<string, unknown>[][],
    queries: [] as { text: string; values: unknown[] }[],
  }
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[]) => {
        state.queries.push({ text, values })
        const next = state.rowQueue.shift() ?? []
        return { rows: next, rowCount: next.length }
      },
    }),
  }
})

import * as pg from "@/lib/pg"
import { bulkUpdateTransactions } from "@/models/transactions"

type MockState = { rowQueue: Record<string, unknown>[][]; queries: { text: string; values: unknown[] }[] }

function mockState() {
  return (pg as unknown as { __state: MockState }).__state
}

function seedRows(rows: Record<string, unknown>[]) {
  mockState().rowQueue.push(rows)
}

function lastQueries() {
  return mockState().queries
}

const USER_ID = "00000000-0000-0000-0000-000000000001"

describe("bulkUpdateTransactions", () => {
  beforeEach(() => {
    const s = mockState()
    s.rowQueue = []
    s.queries = []
  })

  it("dry-run returns match count without writing", async () => {
    seedRows([{ count: 7 }])  // COUNT query
    seedRows([{ id: "t1" }, { id: "t2" }])  // sample IDs query
    const res = await bulkUpdateTransactions(
      USER_ID,
      { merchant: "AWS" },
      { categoryCode: "software" },
      { dryRun: true },
    )
    expect(res.matchCount).toBe(7)
    expect(res.sampleIds).toEqual(["t1", "t2"])
    expect(res.updated).toBe(0)
    expect(lastQueries().every((q) => /SELECT/.test(q.text))).toBe(true)
  })

  it("scopes every query by user_id", async () => {
    seedRows([{ count: 0 }])
    seedRows([])
    await bulkUpdateTransactions(USER_ID, { merchant: "AWS" }, { categoryCode: "software" }, { dryRun: true })
    expect(lastQueries().every((q) => /user_id =/.test(q.text))).toBe(true)
  })

  it("rejects match count above cap", async () => {
    seedRows([{ count: 1500 }])
    seedRows([])
    await expect(
      bulkUpdateTransactions(USER_ID, { merchant: "AWS" }, { categoryCode: "software" }, {}),
    ).rejects.toThrow(/too many matches/i)
  })

  it("performs the UPDATE when not dry-run and under cap", async () => {
    seedRows([{ count: 3 }])
    seedRows([{ id: "t1" }, { id: "t2" }, { id: "t3" }])
    seedRows([{ id: "t1" }, { id: "t2" }, { id: "t3" }])  // UPDATE result rows
    const res = await bulkUpdateTransactions(
      USER_ID,
      { merchant: "AWS" },
      { categoryCode: "software" },
      {},
    )
    expect(res.matchCount).toBe(3)
    expect(res.updated).toBeGreaterThanOrEqual(0)
    expect(lastQueries().some((q) => /UPDATE transactions/.test(q.text))).toBe(true)
  })
})
