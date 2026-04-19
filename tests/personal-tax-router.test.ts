import { describe, it, expect, vi } from "vitest"

vi.mock("@/models/income-sources", () => ({
  sumPersonalIncome: vi.fn(async (_userId: string, _year: number, kind: string) => {
    if (kind === "salary") return { grossCents: 3_000_000, withheldCents: 400_000 }
    if (kind === "rental") return { grossCents: 1_200_000, withheldCents: 0 }
    if (kind === "dividend") return { grossCents: 500_000, withheldCents: 95_000 }
    if (kind === "interest") return { grossCents: 200_000, withheldCents: 38_000 }
    return { grossCents: 0, withheldCents: 0 }
  }),
}))

vi.mock("@/models/personal-deductions", () => ({
  sumDeductionsForYear: vi.fn(async () => ({
    baseReductionCents: 150_000,
    cuotaCreditCents: 50_000,
  })),
}))

vi.mock("@/lib/pg", () => ({
  getPool: vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [{ gain_cents: 100_000 }] })),
  })),
}))

import { personalTaxRouter } from "@/lib/trpc/routers/personal-tax"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const ctx = { user: { id: USER_ID } }

function caller() {
  return personalTaxRouter.createCaller(
    ctx as unknown as Parameters<typeof personalTaxRouter.createCaller>[0],
  )
}

describe("personalTax.estimate", () => {
  it("aggregates all personal income categories into general + savings bases", async () => {
    const result = await caller().estimate({ year: 2025 })
    // General base = salary + rental - pension reduction
    //              = 30_000 + 12_000 - 1_500 = 40_500 € = 4_050_000 cents
    expect(result.generalBaseCents).toBe(4_050_000)
    // Savings base = dividend + interest + crypto
    //              = 5_000 + 2_000 + 1_000 = 8_000 € = 800_000 cents
    expect(result.savingsBaseCents).toBe(800_000)
  })

  it("computes total withheld as sum across categories", async () => {
    const result = await caller().estimate({ year: 2025 })
    // 4000 + 0 + 950 + 380 = 5330 € = 533_000 cents
    expect(result.totalWithheldCents).toBe(533_000)
  })

  it("applies cuota credits before comparing to withheld", async () => {
    const result = await caller().estimate({ year: 2025 })
    expect(result.cuotaLiquidaCents).toBe(
      Math.max(0, result.cuotaIntegraCents - 50_000),
    )
  })

  it("returns positive resultCents when cuota exceeds withheld", async () => {
    const result = await caller().estimate({ year: 2025 })
    expect(result.resultCents).toBe(
      result.cuotaLiquidaCents - result.totalWithheldCents,
    )
  })
})
