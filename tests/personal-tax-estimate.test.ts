import { describe, expect, it } from "vitest"
import { computeProgressiveTax } from "@/models/personal-tax-estimate"

// The bracket schedule used here mirrors the savings-base schedule in
// personal-tax-estimate.ts so we're testing the shape of the calc rather than
// re-asserting specific bracket rates (those may shift year-to-year).

describe("computeProgressiveTax", () => {
  const SAVINGS_BRACKETS = [
    { limitCents: 600_000, ratePct: 19 },
    { limitCents: 5_000_000, ratePct: 21 },
    { limitCents: 20_000_000, ratePct: 23 },
    { limitCents: 30_000_000, ratePct: 27 },
    { limitCents: Number.MAX_SAFE_INTEGER, ratePct: 28 },
  ]

  it("returns zero tax for a zero base", () => {
    expect(computeProgressiveTax(0, SAVINGS_BRACKETS)).toBe(0)
  })

  it("returns zero tax for a negative base", () => {
    expect(computeProgressiveTax(-50_000, SAVINGS_BRACKETS)).toBe(0)
  })

  it("taxes amounts fully within the first band at that rate", () => {
    // €5,000 → 5_000_00 cents · entirely in 19% band → €950 · 95_000 cents
    expect(computeProgressiveTax(500_000, SAVINGS_BRACKETS)).toBe(95_000)
  })

  it("splits across the first two bands", () => {
    // €8,000: €6,000 @ 19% = €1,140 · €2,000 @ 21% = €420 · total €1,560 = 156_000 cents
    expect(computeProgressiveTax(800_000, SAVINGS_BRACKETS)).toBe(156_000)
  })

  it("taxes a €100,000 base across three bands", () => {
    // €6,000 @ 19% = €1,140
    // €44,000 @ 21% = €9,240
    // €50,000 @ 23% = €11,500
    // total €21,880 = 2_188_000 cents
    expect(computeProgressiveTax(10_000_000, SAVINGS_BRACKETS)).toBe(2_188_000)
  })

  it("applies the top band only to the excess above the last limit", () => {
    // €400,000:
    //   6K @ 19%   = 1_140
    //   44K @ 21%  = 9_240
    //   150K @ 23% = 34_500
    //   100K @ 27% = 27_000
    //   100K @ 28% = 28_000
    //   total 99_880 € = 9_988_000 cents
    expect(computeProgressiveTax(40_000_000, SAVINGS_BRACKETS)).toBe(9_988_000)
  })

  it("is continuous at band edges", () => {
    // Right at the 6K edge → 6K @ 19% = 1140 € = 114_000 cents
    expect(computeProgressiveTax(600_000, SAVINGS_BRACKETS)).toBe(114_000)
  })

  it("handles a trivial single-band schedule", () => {
    const flat = [{ limitCents: Number.MAX_SAFE_INTEGER, ratePct: 10 }]
    // €100 @ 10% = €10 = 1_000 cents
    expect(computeProgressiveTax(10_000, flat)).toBe(1_000)
  })
})
