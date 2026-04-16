import { describe, expect, it } from "vitest"

import {
  buildDashboardDrilldownHref,
  buildDashboardDrilldownSearchParams,
  getDashboardPeriodRange,
} from "@/components/dashboard/dashboard-drilldown"

describe("dashboard drilldown helpers", () => {
  it("builds a monthly period range", () => {
    expect(getDashboardPeriodRange("2026-01")).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
    })
  })

  it("builds a daily period range", () => {
    expect(getDashboardPeriodRange("2026-01-15")).toEqual({
      dateFrom: "2026-01-15",
      dateTo: "2026-01-16",
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
      ["dateTo", "2026-02-01"],
      ["categoryCode", "software"],
      ["type", "expense"],
    ])
    expect(buildDashboardDrilldownHref({ period: "2026-01", categoryCode: "software" })).toBe(
      "/transactions?dateFrom=2026-01-01&dateTo=2026-02-01&categoryCode=software",
    )
  })
})
