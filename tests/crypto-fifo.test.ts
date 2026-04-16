import { describe, expect, it } from "vitest"
import { planFifoDisposal, type FifoPlanLot } from "@/models/crypto-fifo"

function lot(id: string, quantityRemaining: string, costPerUnitCents: number): FifoPlanLot {
  return { id, quantityRemaining, costPerUnitCents }
}

describe("planFifoDisposal", () => {
  it("matches a single lot exactly (no leftover)", () => {
    // Buy 1 BTC @ €30,000. Sell 1 BTC @ €50,000. Gain = €20,000.
    const lots = [lot("a", "1", 3000000)]
    const plan = planFifoDisposal(lots, 1, 5000000)

    expect(plan.matches).toHaveLength(1)
    const [m0] = plan.matches
    expect(m0).toBeDefined()
    if (!m0) throw new Error("expected match")
    expect(m0).toEqual({
      lotId: "a",
      quantityConsumed: 1,
      costBasisCents: 3000000,
      proceedsCents: 5000000,
      realizedGainCents: 2000000,
    })
    expect(plan.totalRealizedGainCents).toBe(2000000)
    expect(plan.unmatchedQuantity).toBe(0)
    expect(plan.weightedAvgCostPerUnitCents).toBe(3000000)
  })

  it("walks multiple lots FIFO, splitting the disposal across them", () => {
    // Buy 1 BTC @ €30K (Jan), buy 0.5 BTC @ €40K (Mar). Sell 1.2 BTC @ €50K.
    // Match: 1.0 @ €30K (gain 20K) + 0.2 @ €40K (gain 10K) → 22K total gain.
    const lots = [lot("jan", "1", 3000000), lot("mar", "0.5", 4000000)]
    const plan = planFifoDisposal(lots, 1.2, 5000000)

    expect(plan.matches).toHaveLength(2)
    const [m0, m1] = plan.matches
    expect(m0).toBeDefined()
    expect(m1).toBeDefined()
    if (!m0 || !m1) throw new Error("expected two matches")
    expect(m0).toMatchObject({
      lotId: "jan",
      quantityConsumed: 1,
      realizedGainCents: 2000000,
    })
    // JS float math leaves 0.19999...6 rather than exactly 0.2, but cents
    // arithmetic is rounded so the realised gain stays integer-exact.
    expect(m1.lotId).toBe("mar")
    expect(m1.quantityConsumed).toBeCloseTo(0.2, 6)
    expect(m1.realizedGainCents).toBe(200000) // (50K-40K)*0.2
    expect(plan.totalRealizedGainCents).toBe(2200000)
    expect(plan.totalQuantityMatched).toBeCloseTo(1.2)
    expect(plan.unmatchedQuantity).toBeCloseTo(0)
  })

  it("leaves unmatched quantity when there aren't enough lots", () => {
    // Buy 0.5 BTC @ €30K. Sell 1 BTC @ €50K → can only match 0.5 BTC.
    const lots = [lot("only", "0.5", 3000000)]
    const plan = planFifoDisposal(lots, 1, 5000000)

    expect(plan.matches).toHaveLength(1)
    const [only] = plan.matches
    expect(only).toBeDefined()
    if (!only) throw new Error("expected match")
    expect(only.quantityConsumed).toBe(0.5)
    expect(plan.unmatchedQuantity).toBe(0.5)
    expect(plan.totalRealizedGainCents).toBe(1000000) // (50K-30K)*0.5
  })

  it("handles a loss correctly (cost > proceeds)", () => {
    // Buy 1 BTC @ €60K. Sell 1 BTC @ €40K → €20K loss (negative gain).
    const lots = [lot("a", "1", 6000000)]
    const plan = planFifoDisposal(lots, 1, 4000000)

    const [lossMatch] = plan.matches
    expect(lossMatch).toBeDefined()
    if (!lossMatch) throw new Error("expected match")
    expect(lossMatch.realizedGainCents).toBe(-2000000)
    expect(plan.totalRealizedGainCents).toBe(-2000000)
  })

  it("handles zero-cost airdrop disposal", () => {
    // Airdrop 100 TOKEN at cost 0, then sell all 100 @ €1 each.
    const lots = [lot("air", "100", 0)]
    const plan = planFifoDisposal(lots, 100, 100)

    expect(plan.totalRealizedGainCents).toBe(10000)
    const [airMatch] = plan.matches
    expect(airMatch).toBeDefined()
    if (!airMatch) throw new Error("expected match")
    expect(airMatch.costBasisCents).toBe(0)
    expect(airMatch.proceedsCents).toBe(10000)
  })

  it("skips lots with zero or negative remaining quantity", () => {
    const lots = [
      lot("exhausted", "0", 3000000),
      lot("next", "1", 4000000),
    ]
    const plan = planFifoDisposal(lots, 1, 5000000)

    expect(plan.matches).toHaveLength(1)
    const [nextMatch] = plan.matches
    expect(nextMatch).toBeDefined()
    if (!nextMatch) throw new Error("expected match")
    expect(nextMatch.lotId).toBe("next")
  })

  it("returns empty plan when disposal quantity is zero", () => {
    const lots = [lot("a", "1", 3000000)]
    const plan = planFifoDisposal(lots, 0, 5000000)

    expect(plan.matches).toHaveLength(0)
    expect(plan.totalRealizedGainCents).toBe(0)
    expect(plan.unmatchedQuantity).toBe(0)
    expect(plan.weightedAvgCostPerUnitCents).toBeNull()
  })

  it("computes weighted average cost per unit across multiple lots", () => {
    // 1.0 @ €30K + 0.2 @ €40K consumed → cost basis 38K total, avg 31.67K/BTC.
    const lots = [lot("jan", "1", 3000000), lot("mar", "0.5", 4000000)]
    const plan = planFifoDisposal(lots, 1.2, 5000000)

    // totalCost = 30K * 1.0 + 40K * 0.2 = 30K + 8K = 38K → 3_800_000 cents / 1.2 = 3_166_667
    expect(plan.weightedAvgCostPerUnitCents).toBe(3166667)
  })

  it("preserves order when multiple lots at same cost", () => {
    const lots = [lot("first", "1", 3000000), lot("second", "1", 3000000)]
    const plan = planFifoDisposal(lots, 1.5, 5000000)

    const [firstMatch, secondMatch] = plan.matches
    expect(firstMatch).toBeDefined()
    expect(secondMatch).toBeDefined()
    if (!firstMatch || !secondMatch) throw new Error("expected two matches")
    expect(firstMatch.lotId).toBe("first")
    expect(secondMatch.lotId).toBe("second")
    expect(firstMatch.quantityConsumed).toBe(1)
    expect(secondMatch.quantityConsumed).toBe(0.5)
  })
})
