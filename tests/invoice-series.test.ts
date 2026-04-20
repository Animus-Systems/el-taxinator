import { describe, expect, it } from "vitest"
import {
  detectSeriesGaps,
  parseInvoiceNumber,
  formatNumberInSeries,
} from "@/lib/invoice-series"

describe("parseInvoiceNumber", () => {
  it("splits into series + ordinal at the last digit run", () => {
    expect(parseInvoiceNumber("F-2026-0003")).toEqual({
      series: "F-2026-",
      ord: 3,
      padding: 4,
    })
  })

  it("handles embedded years without a separator", () => {
    expect(parseInvoiceNumber("R2026-0009")).toEqual({
      series: "R2026-",
      ord: 9,
      padding: 4,
    })
  })

  it("returns null for numbers without a trailing digit run", () => {
    expect(parseInvoiceNumber("")).toBeNull()
    expect(parseInvoiceNumber("ABC")).toBeNull()
  })
})

describe("formatNumberInSeries", () => {
  it("preserves padding", () => {
    expect(formatNumberInSeries("F-2026-", 7, 4)).toBe("F-2026-0007")
  })
})

describe("detectSeriesGaps", () => {
  it("reports missing ordinals inside the min–max range of each series", () => {
    const gaps = detectSeriesGaps([
      "F-2026-0001",
      "F-2026-0002",
      "F-2026-0005",
      "F-2026-0006",
    ])
    expect(gaps.map((g) => g.label)).toEqual(["F-2026-0003", "F-2026-0004"])
  })

  it("treats different series independently", () => {
    const gaps = detectSeriesGaps([
      "F-2026-0001",
      "F-2026-0003",
      "R-2026-0001",
      "R-2026-0002",
    ])
    expect(gaps.map((g) => g.label)).toEqual(["F-2026-0002"])
  })

  it("treats different years as different series", () => {
    const gaps = detectSeriesGaps(["F-2025-0099", "F-2026-0001", "F-2026-0002"])
    expect(gaps).toEqual([])
  })

  it("does not flag a series with a single number (can't know if 2..N exist)", () => {
    expect(detectSeriesGaps(["F-2026-0042"])).toEqual([])
  })

  it("ignores unparseable inputs", () => {
    expect(detectSeriesGaps(["", "DRAFT", "F-2026-0001", "F-2026-0003"])).toEqual([
      expect.objectContaining({ label: "F-2026-0002" }),
    ])
  })
})
