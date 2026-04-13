import { describe, expect, it } from "vitest"
import {
  filtersToSearchParams,
  searchParamsToFilters,
} from "@/lib/transaction-filters"

describe("transaction filter URL helpers", () => {
  it("preserves all supported filters from the URL", () => {
    const params = new URLSearchParams(
      "search=spotify&dateFrom=2026-01-01&dateTo=2026-03-31&ordering=-issuedAt&categoryCode=software&projectCode=client-a&accountId=acc-1&type=expense",
    )

    expect(searchParamsToFilters(params)).toEqual({
      search: "spotify",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      ordering: "-issuedAt",
      categoryCode: "software",
      projectCode: "client-a",
      accountId: "acc-1",
      type: "expense",
    })
  })

  it("keeps non-filter params while serializing account and type filters", () => {
    const params = new URLSearchParams("page=3&tab=all")
    const result = filtersToSearchParams(
      {
        search: "invoice",
        accountId: "acc-99",
        type: "income",
        categoryCode: "-",
        projectCode: "",
      },
      params,
    )

    expect(result.get("page")).toBe("3")
    expect(result.get("tab")).toBe("all")
    expect(result.get("search")).toBe("invoice")
    expect(result.get("accountId")).toBe("acc-99")
    expect(result.get("type")).toBe("income")
    expect(result.has("categoryCode")).toBe(false)
    expect(result.has("projectCode")).toBe(false)
  })
})
