import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  queryMany: vi.fn(),
}))

vi.mock("@/lib/sql", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sql")>("@/lib/sql")
  return { ...actual, queryMany: mocks.queryMany }
})

import { findTransferMatch } from "@/models/transfers"

const baseInput = {
  selfId: null,
  userId: "u1",
  accountId: "acc-out",
  total: 160000,
  currencyCode: "EUR",
  issuedAt: new Date("2026-03-05"),
  kind: "outgoing" as const,
}

describe("findTransferMatch", () => {
  beforeEach(() => mocks.queryMany.mockReset())

  it("returns unique match when exactly one opposite-sign candidate exists", async () => {
    mocks.queryMany.mockResolvedValueOnce([
      { id: "cand-1", accountId: "acc-in", total: 160000, currencyCode: "EUR" },
    ])
    const result = await findTransferMatch(baseInput)
    expect(result.kind).toBe("unique")
    if (result.kind === "unique") expect(result.match.id).toBe("cand-1")
  })

  it("returns ambiguous when multiple candidates match", async () => {
    mocks.queryMany.mockResolvedValueOnce([
      { id: "a", accountId: "acc-in", total: 160000, currencyCode: "EUR" },
      { id: "b", accountId: "acc-in-2", total: 160000, currencyCode: "EUR" },
    ])
    const result = await findTransferMatch(baseInput)
    expect(result.kind).toBe("ambiguous")
    if (result.kind === "ambiguous") expect(result.candidates).toHaveLength(2)
  })

  it("returns none when no candidate exists", async () => {
    mocks.queryMany.mockResolvedValueOnce([])
    const result = await findTransferMatch(baseInput)
    expect(result.kind).toBe("none")
  })
})
