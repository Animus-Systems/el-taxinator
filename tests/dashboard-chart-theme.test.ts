import { describe, expect, it } from "vitest"

import { dashboardChartTheme, getDashboardCategoryColor } from "@/components/dashboard/dashboard-chart-theme"

describe("dashboardChartTheme", () => {
  it("uses the visual direction A color palette", () => {
    expect(dashboardChartTheme.colors.positive).toBe("#10b981")
    expect(dashboardChartTheme.colors.expense).toBe("#ef4444")
    expect(dashboardChartTheme.colors.surface).toBe("#f8fafc")
    expect(dashboardChartTheme.colors.text).toBe("#0f172a")
  })

  it("returns stable fallback category colors", () => {
    expect(getDashboardCategoryColor("software")).toBe(getDashboardCategoryColor("software"))
    expect(getDashboardCategoryColor("software")).not.toBe(getDashboardCategoryColor("meals"))
    expect(getDashboardCategoryColor(null, 0)).toBe("#0f766e")
    expect(getDashboardCategoryColor(null, 1)).toBe("#14b8a6")
    expect(getDashboardCategoryColor(null, 32)).toBe("#0f766e")
  })
})
