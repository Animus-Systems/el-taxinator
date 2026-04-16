import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type QueryCall = { sql: string; params: unknown[] }
const calls: QueryCall[] = []
const mockQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>()

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return mockQuery(sql, params)
    },
  })),
}))

import { normalizeVendorPattern, upsertAlias } from "@/models/receipt-aliases"

describe("normalizeVendorPattern", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeVendorPattern("   Leroy    Merlin  S.L.  ")).toBe("leroy merlin s.l.")
    expect(normalizeVendorPattern("VODAFONE\nES")).toBe("vodafone\nes".replace(/\s+/g, " "))
    expect(normalizeVendorPattern("Mercadona")).toBe("mercadona")
  })

  it("is stable on already-normalized strings", () => {
    expect(normalizeVendorPattern("mercadona")).toBe("mercadona")
  })
})

describe("upsertAlias", () => {
  beforeEach(() => {
    calls.length = 0
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("normalizes inputs and increments usage_count on conflict", async () => {
    await upsertAlias("user-1", "  Leroy MERLIN ", "LEROY MERLIN SL", "accept")

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const call = calls[0]!
    expect(call.sql).toContain("INSERT INTO receipt_vendor_aliases")
    expect(call.sql).toContain("ON CONFLICT (user_id, vendor_pattern, merchant_pattern)")
    expect(call.sql).toContain("usage_count = receipt_vendor_aliases.usage_count + 1")
    expect(call.params).toEqual(["user-1", "leroy merlin", "leroy merlin sl", "accept"])
  })

  it("is a no-op when vendor or merchant is blank after normalization", async () => {
    await upsertAlias("user-1", "   ", "something", "accept")
    await upsertAlias("user-1", "something", "  ", "accept")
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
