import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: () => null,
}))

const { router } = await import("@/src/router")

describe("tax calculator routes", () => {
  it("registers the annual and quarterly detail pages linked from the tax dashboard", () => {
    expect(router.routesByPath["/tax"]).toBeDefined()
    expect(router.routesByPath["/tax/$year"]).toBeDefined()
    expect(router.routesByPath["/tax/$year/$quarter"]).toBeDefined()
  })
})
