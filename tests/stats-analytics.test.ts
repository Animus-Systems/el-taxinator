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
        rows: [{ min_date: new Date("2026-01-01"), max_date: new Date("2026-02-01") }],
      })
      .mockResolvedValueOnce({
        rows: [
          { period: "2026-01", period_date: new Date("2026-01-01"), income: 900, expenses: 300 },
          { period: "2026-02", period_date: new Date("2026-02-01"), income: 1100, expenses: 500 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            code: "software",
            name: { en: "Software", es: "Software" },
            color: "#0d9488",
            expenses: 420,
            transaction_count: 3,
          },
          { code: null, name: null, color: null, expenses: 80, transaction_count: 1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { merchant: "Google Workspace", expenses: 210, transaction_count: 2, is_unlabeled: 0 },
          { merchant: "Mercadona", expenses: 180, transaction_count: 4, is_unlabeled: 0 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { currency: "USD", transaction_count: 2 },
        ],
      })

    const analytics = await getDashboardAnalytics("user-1", { dateFrom: "2026-01-01", dateTo: "2026-02-29" }, "EUR")

    expect(mockQuery).toHaveBeenCalledTimes(5)
    expect(mockQuery.mock.calls[2]?.[0]).not.toContain("issued_at IS NOT NULL")
    expect(mockQuery.mock.calls[3]?.[0]).not.toContain("issued_at IS NOT NULL")
    expect(analytics.timeSeries).toHaveLength(2)
    const firstCategory = analytics.categoryBreakdown[0]
    expect(firstCategory).toMatchObject({
      code: "software",
      name: "Software",
      expenses: 420,
    })
    expect(firstCategory?.name).toBe("Software")
    expect(analytics.categoryBreakdown[1]).toMatchObject({ code: "other", name: "Other", expenses: 80 })
    expect(analytics.topMerchants[0]).toMatchObject({ merchant: "Google Workspace", expenses: 210 })
    expect(analytics.profitTrend).toEqual([
      { period: "2026-01", profit: 600, date: new Date("2026-01-01") },
      { period: "2026-02", profit: 600, date: new Date("2026-02-01") },
    ])
    expect(analytics.otherCurrencies).toEqual([{ currency: "USD", transactionCount: 2 }])
  })

  it("excludes personal rows and transfer/conversion types from category and merchant breakdowns", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await getDashboardAnalytics("user-1", {}, "EUR")

    const categorySql = mockQuery.mock.calls[2]?.[0] ?? ""
    const merchantSql = mockQuery.mock.calls[3]?.[0] ?? ""
    for (const sql of [categorySql, merchantSql]) {
      expect(sql).toContain("personal_ignored")
      expect(sql).toContain("personal_taxable")
      expect(sql).toContain("'transfer'")
      expect(sql).toContain("'exchange'")
    }
  })
})
