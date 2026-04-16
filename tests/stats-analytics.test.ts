import { beforeEach, describe, expect, it, vi } from "vitest"

const mockQuery = vi.fn<
  (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
>()

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({ query: mockQuery })),
}))

vi.mock("@/lib/sql", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sql")>("@/lib/sql")
  return {
    ...actual,
    mapRow: <T,>(row: unknown) => row as T,
  }
})

import { getDashboardAnalytics } from "@/models/stats"

describe("getDashboardAnalytics", () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it("returns category breakdown, merchant rankings, and profit trend in one payload", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { period: "2026-01", period_date: new Date("2026-01-01"), income: 900, expenses: 300 },
          { period: "2026-02", period_date: new Date("2026-02-01"), income: 1100, expenses: 500 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { code: "software", name: "Software", color: "#0d9488", expenses: 420, transaction_count: 3 },
          { code: null, name: null, color: null, expenses: 80, transaction_count: 1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { merchant: "Google Workspace", expenses: 210, transaction_count: 2 },
          { merchant: "Mercadona", expenses: 180, transaction_count: 4 },
        ],
      })

    const analytics = await getDashboardAnalytics("user-1", { dateFrom: "2026-01-01", dateTo: "2026-02-29" }, "EUR")

    expect(analytics.timeSeries).toHaveLength(2)
    expect(analytics.categoryBreakdown[0]).toMatchObject({ code: "software", expenses: 420 })
    expect(analytics.categoryBreakdown[1]).toMatchObject({ code: "other", name: "Other", expenses: 80 })
    expect(analytics.topMerchants[0]).toMatchObject({ merchant: "Google Workspace", expenses: 210 })
    expect(analytics.profitTrend).toEqual([
      { period: "2026-01", profit: 600, date: new Date("2026-01-01") },
      { period: "2026-02", profit: 600, date: new Date("2026-02-01") },
    ])
  })
})
