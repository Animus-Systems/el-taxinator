import { describe, expect, it } from "vitest"

import {
  buildDashboardDrilldownHref,
  buildDashboardDrilldownSearchParams,
  getDashboardPeriodRange,
} from "@/components/dashboard/dashboard-drilldown"

describe("dashboard drilldown helpers", () => {
  it("builds a monthly period range whose dateTo is the true last day of the month", () => {
    // The transactions model treats dateTo as inclusive (WHERE issued_at < dateTo + 1 day),
    // so the helper must return the calendar end-of-month, not the first day of next month.
    expect(getDashboardPeriodRange("2026-01")).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    })
  })

  it("builds a daily period range spanning only that day", () => {
    expect(getDashboardPeriodRange("2026-01-15")).toEqual({
      dateFrom: "2026-01-15",
      dateTo: "2026-01-15",
    })
  })

  it("builds a drilldown href with stable transaction filters", () => {
    const params = buildDashboardDrilldownSearchParams({
      period: "2026-01",
      search: "Google Workspace",
      categoryCode: "software",
      type: "expense",
    })

    expect(Array.from(params.entries())).toEqual([
      ["search", "Google Workspace"],
      ["dateFrom", "2026-01-01"],
      ["dateTo", "2026-01-31"],
      ["categoryCode", "software"],
      ["type", "expense"],
    ])
    expect(buildDashboardDrilldownHref({ period: "2026-01", categoryCode: "software" })).toBe(
      "/transactions?dateFrom=2026-01-01&dateTo=2026-01-31&categoryCode=software",
    )
  })

  it("prefers the period range over a caller-supplied date range", () => {
    const params = buildDashboardDrilldownSearchParams({
      period: "2026-01",
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    })

    expect(params.get("dateFrom")).toBe("2026-01-01")
    expect(params.get("dateTo")).toBe("2026-01-31")
  })
})
