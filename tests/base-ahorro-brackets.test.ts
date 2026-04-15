import { describe, expect, it } from "vitest"
import { applyBaseAhorroBrackets } from "@/models/tax"

describe("applyBaseAhorroBrackets (2026 brackets)", () => {
  it("returns zero tax for zero base", () => {
    const { breakdown, totalCuotaCents } = applyBaseAhorroBrackets(0)
    expect(totalCuotaCents).toBe(0)
    expect(breakdown.every((b) => b.amountInBracketCents === 0)).toBe(true)
  })

  it("taxes €5,000 entirely at 19% (first bracket)", () => {
    const { totalCuotaCents, breakdown } = applyBaseAhorroBrackets(500000)
    expect(totalCuotaCents).toBe(Math.round(500000 * 0.19))
    expect(breakdown[0].amountInBracketCents).toBe(500000)
    expect(breakdown[1].amountInBracketCents).toBe(0)
  })

  it("taxes €8,000 across the 19% and 21% bands", () => {
    // €6,000 at 19% = 1,140 ; €2,000 at 21% = 420 ; total 1,560
    const { totalCuotaCents, breakdown } = applyBaseAhorroBrackets(800000)
    expect(breakdown[0].amountInBracketCents).toBe(600000)
    expect(breakdown[0].taxInBracketCents).toBe(114000)
    expect(breakdown[1].amountInBracketCents).toBe(200000)
    expect(breakdown[1].taxInBracketCents).toBe(42000)
    expect(totalCuotaCents).toBe(156000)
  })

  it("taxes €100K across three bands (19% / 21% / 23%)", () => {
    // €6K at 19% = 1,140 ; €44K at 21% = 9,240 ; €50K at 23% = 11,500 ; total 21,880
    const { totalCuotaCents } = applyBaseAhorroBrackets(10_000_000)
    expect(totalCuotaCents).toBe(2_188_000)
  })

  it("applies 27% to the €200K–€300K band and 28% above €300K", () => {
    // €400K total:
    //  6K * 0.19 =   1_140
    //  44K * 0.21 =  9_240
    //  150K * 0.23 = 34_500
    //  100K * 0.27 = 27_000
    //  100K * 0.28 = 28_000
    //  total = 99_880 €
    const { totalCuotaCents } = applyBaseAhorroBrackets(40_000_000)
    expect(totalCuotaCents).toBe(9_988_000)
  })

  it("never charges tax on a negative base", () => {
    const { totalCuotaCents } = applyBaseAhorroBrackets(-500000)
    expect(totalCuotaCents).toBe(0)
  })

  it("reports per-bracket breakdown with amounts summing back to the base", () => {
    const base = 1_500_000 // €15,000
    const { breakdown, totalCuotaCents } = applyBaseAhorroBrackets(base)
    const amountSum = breakdown.reduce((s, b) => s + b.amountInBracketCents, 0)
    const taxSum = breakdown.reduce((s, b) => s + b.taxInBracketCents, 0)
    expect(amountSum).toBe(base)
    expect(taxSum).toBe(totalCuotaCents)
    // 6K @ 19% + 9K @ 21% = 1,140 + 1,890 = 3,030 €
    expect(totalCuotaCents).toBe(303_000)
  })

  it("accepts a custom bracket schedule for future years", () => {
    const flat = [{ upToCents: Infinity, rate: 0.1 }]
    const { totalCuotaCents } = applyBaseAhorroBrackets(100_000, flat)
    expect(totalCuotaCents).toBe(10_000)
  })
})
