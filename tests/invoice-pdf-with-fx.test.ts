import { describe, it, expect } from "vitest"
import { fxBlockLines, type FxBlockInput } from "@/components/invoicing/invoice-pdf"

const EN_LABELS = {
  priceInEur: "Price in EUR",
  rateLine: "Price EUR/{code}",
  ratesTakenFrom: "Prices taken from",
}

const ES_LABELS = {
  priceInEur: "Precio en EUR",
  rateLine: "Cambio EUR/{code}",
  ratesTakenFrom: "Precios tomados de",
}

function input(overrides: Partial<FxBlockInput> = {}): FxBlockInput {
  return {
    currencyCode: "GBP",
    fxRateToEur: "1.1472",
    fxRateDate: new Date("2026-04-22"),
    fxRateSource: "https://www.ecb.europa.eu",
    totalAfterIrpf: 30000, // £300.00 in minor units
    labels: EN_LABELS,
    ...overrides,
  }
}

describe("fxBlockLines", () => {
  it("returns three formatted lines for a non-EUR invoice with a locked rate", () => {
    const block = fxBlockLines(input())
    expect(block).not.toBeNull()
    // 300.00 × 1.1472 = 344.16 EUR, formatted to 4 decimals matching user's hand-typed format.
    expect(block?.priceLine).toBe("Price in EUR: 344.1600")
    // Effective date appended so readers can see when ECB published the rate —
    // matters on weekend/holiday fallbacks where the date differs from issue date.
    expect(block?.rateLine).toBe("Price EUR/GBP: GBP 1 = EUR 1.1472 (22/04/2026)")
    expect(block?.sourceLine).toBe("Prices taken from: https://www.ecb.europa.eu")
  })

  it("returns null for EUR invoices regardless of rate presence", () => {
    expect(fxBlockLines(input({ currencyCode: "EUR" }))).toBeNull()
  })

  it("returns null when the rate is missing, zero, or malformed", () => {
    expect(fxBlockLines(input({ fxRateToEur: null }))).toBeNull()
    expect(fxBlockLines(input({ fxRateDate: null }))).toBeNull()
    expect(fxBlockLines(input({ fxRateToEur: "0" }))).toBeNull()
    expect(fxBlockLines(input({ fxRateToEur: "not a number" }))).toBeNull()
  })

  it("interpolates the currency code into the rate label", () => {
    const block = fxBlockLines(input({ currencyCode: "USD", fxRateToEur: "0.92" }))
    expect(block?.rateLine).toMatch(/^Price EUR\/USD: USD 1 = EUR 0\.9200 \(\d{2}\/\d{2}\/\d{4}\)$/)
  })

  it("uses Spanish labels when given the Spanish label set", () => {
    const block = fxBlockLines(input({ labels: ES_LABELS }))
    expect(block?.priceLine.startsWith("Precio en EUR")).toBe(true)
    expect(block?.rateLine.startsWith("Cambio EUR/GBP")).toBe(true)
    expect(block?.sourceLine.startsWith("Precios tomados de")).toBe(true)
  })

  it("falls back to the default ECB attribution URL when fxRateSource is null", () => {
    const block = fxBlockLines(input({ fxRateSource: null }))
    expect(block?.sourceLine).toContain("https://www.ecb.europa.eu")
  })

  it("uppercases lowercase currency codes before interpolating", () => {
    const block = fxBlockLines(input({ currencyCode: "gbp" }))
    expect(block?.rateLine).toContain("GBP 1")
    expect(block?.rateLine).toContain("Price EUR/GBP")
  })
})
