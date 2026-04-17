import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({ query: mocks.query })),
}))

import { getDashboardStats } from "@/models/stats"

describe("stats exclude type='transfer' rows", () => {
  it("adds type <> 'transfer' to buildStatsWhere", async () => {
    mocks.query.mockResolvedValue({ rows: [] })
    await getDashboardStats("user-1", {})
    // Multiple queries may be issued — scan all of them for the exclusion.
    const allSql = mocks.query.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("\n")
    expect(allSql).toMatch(/type\s*<>\s*'transfer'/i)
    expect(allSql).toMatch(/personal_ignored/i) // still excludes personal
  })
})
