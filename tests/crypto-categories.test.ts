import { describe, expect, it } from "vitest"

import { DEFAULT_CATEGORIES } from "@/lib/default-categories"

describe("default crypto categories", () => {
  const codes = new Set(DEFAULT_CATEGORIES.map((c) => c.code))

  it.each([
    "crypto_disposal",
    "crypto_purchase",
    "crypto_fee",
    "crypto_staking_reward",
    "crypto_airdrop",
  ])("includes %s", (code) => {
    expect(codes.has(code)).toBe(true)
  })

  it("maps crypto_disposal to Modelo 100 base del ahorro (autónomo) and Modelo 200 (SL)", () => {
    const entry = DEFAULT_CATEGORIES.find((c) => c.code === "crypto_disposal")
    expect(entry).toBeDefined()
    expect(entry!.taxFormRef.toLowerCase()).toContain("ganancia patrimonial")
    expect(entry!.taxFormRef).toMatch(/Modelo 100/)
    expect(entry!.taxFormRef).toMatch(/Modelo 200/)
  })

  it("gives staking rewards a capital-mobiliario reference (Modelo 100)", () => {
    const entry = DEFAULT_CATEGORIES.find((c) => c.code === "crypto_staking_reward")
    expect(entry).toBeDefined()
    expect(entry!.taxFormRef.toLowerCase()).toContain("rendimiento")
  })

  it("has bilingual names for every crypto category", () => {
    for (const code of ["crypto_disposal", "crypto_purchase", "crypto_fee", "crypto_staking_reward", "crypto_airdrop"]) {
      const entry = DEFAULT_CATEGORIES.find((c) => c.code === code)
      expect(entry).toBeDefined()
      expect(entry!.name.en.length).toBeGreaterThan(0)
      expect(entry!.name.es.length).toBeGreaterThan(0)
    }
  })

  it("gives each crypto category a non-empty llmPrompt", () => {
    for (const code of ["crypto_disposal", "crypto_purchase", "crypto_fee", "crypto_staking_reward", "crypto_airdrop"]) {
      const entry = DEFAULT_CATEGORIES.find((c) => c.code === code)
      expect(entry!.llmPrompt.length).toBeGreaterThan(10)
    }
  })
})
