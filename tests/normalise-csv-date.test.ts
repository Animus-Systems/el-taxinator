import { describe, expect, it } from "vitest"
import { normaliseCsvDate } from "@/ai/import-csv"

describe("normaliseCsvDate", () => {
  it("parses DD/MM/YYYY (Spanish bank default)", () => {
    expect(normaliseCsvDate("27/01/2026", "dd/MM/yyyy")).toBe("2026-01-27")
  })

  it("parses DD/MM/YYYY for days > 12 (previously Invalid Date in commit)", () => {
    // 15/01/2026 under US M/D/Y would have been month=15 → Invalid Date and
    // the whole row would have silently failed the INSERT. Regression lock.
    expect(normaliseCsvDate("15/01/2026", "dd/MM/yyyy")).toBe("2026-01-15")
    expect(normaliseCsvDate("31/12/2025", "dd/MM/yyyy")).toBe("2025-12-31")
  })

  it("parses YYYY-MM-DD when the detector picked ISO", () => {
    expect(normaliseCsvDate("2026-01-27", "yyyy-MM-dd")).toBe("2026-01-27")
  })

  it("falls back to ISO parse when the format mismatches but the cell is ISO", () => {
    expect(normaliseCsvDate("2026-03-15", "dd/MM/yyyy")).toBe("2026-03-15")
  })

  it("returns null for empty or unparseable input", () => {
    expect(normaliseCsvDate("", "dd/MM/yyyy")).toBeNull()
    expect(normaliseCsvDate(null, "dd/MM/yyyy")).toBeNull()
    expect(normaliseCsvDate("not a date", "dd/MM/yyyy")).toBeNull()
  })

  it("trims whitespace before parsing", () => {
    expect(normaliseCsvDate("  27/01/2026  ", "dd/MM/yyyy")).toBe("2026-01-27")
  })
})
