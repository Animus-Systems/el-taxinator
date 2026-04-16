import { describe, expect, it } from "vitest"
import {
  applyTransactionFilterPatch,
  filtersToSearchParams,
  searchParamsToFilters,
} from "@/lib/transaction-filters"
import { DEFAULT_FIELDS } from "@/models/defaults"

describe("transaction filter URL helpers", () => {
  it("preserves all supported filters from the URL", () => {
    const params = new URLSearchParams(
      "search=spotify&dateFrom=2026-01-01&dateTo=2026-03-31&ordering=-issuedAt&categoryCode=software&projectCode=client-a&accountId=acc-1&type=expense&hasReceipts=missing",
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
      hasReceipts: "missing",
    })
  })

  it("round-trips the hasReceipts filter", () => {
    const params = new URLSearchParams()
    const serialized = filtersToSearchParams({ hasReceipts: "missing" }, params)
    expect(serialized.get("hasReceipts")).toBe("missing")

    const parsed = searchParamsToFilters(serialized)
    expect(parsed.hasReceipts).toBe("missing")
  })

  it("drops hasReceipts when empty or sentinel", () => {
    const params = new URLSearchParams("hasReceipts=attached&page=2")
    const cleared = filtersToSearchParams({ hasReceipts: "" }, params)
    expect(cleared.has("hasReceipts")).toBe(false)
    expect(cleared.get("page")).toBe("2")
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

  it("applies a filter patch while preserving unrelated params and existing filters", () => {
    const params = new URLSearchParams("page=4&tab=all&ordering=-issuedAt&type=expense")

    const result = applyTransactionFilterPatch(params, {
      search: "spotify",
      accountId: "acc-2",
      categoryCode: "software",
    })

    expect(result.get("page")).toBe("4")
    expect(result.get("tab")).toBe("all")
    expect(result.get("ordering")).toBe("-issuedAt")
    expect(result.get("type")).toBe("expense")
    expect(result.get("search")).toBe("spotify")
    expect(result.get("accountId")).toBe("acc-2")
    expect(result.get("categoryCode")).toBe("software")
  })

  it("drops only supported filter keys when clearing filters", () => {
    const params = new URLSearchParams(
      "page=2&tab=all&search=coffee&accountId=acc-1&type=expense&ordering=-issuedAt&hasReceipts=missing",
    )

    const result = filtersToSearchParams({}, params)

    expect(result.get("page")).toBe("2")
    expect(result.get("tab")).toBe("all")
    expect(result.has("search")).toBe(false)
    expect(result.has("accountId")).toBe(false)
    expect(result.has("type")).toBe(false)
    expect(result.has("ordering")).toBe(false)
    expect(result.has("hasReceipts")).toBe(false)
  })
})

describe("transaction default fields", () => {
  it("includes accountName as a visible default transaction field", () => {
    expect(DEFAULT_FIELDS.find((field) => field.code === "accountName")).toMatchObject({
      code: "accountName",
      isVisibleInList: true,
      isExtra: false,
    })
  })
})
