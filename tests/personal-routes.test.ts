import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: () => null,
}))

const { router } = await import("@/src/router")

describe("personal income routes", () => {
  it("registers employment, rental, dividends, interest, and deductions sub-routes", () => {
    expect(router.routesByPath["/personal"]).toBeDefined()
    expect(router.routesByPath["/personal/employment"]).toBeDefined()
    expect(router.routesByPath["/personal/rental"]).toBeDefined()
    expect(router.routesByPath["/personal/dividends"]).toBeDefined()
    expect(router.routesByPath["/personal/interest"]).toBeDefined()
    expect(router.routesByPath["/personal/deductions"]).toBeDefined()
  })
})
