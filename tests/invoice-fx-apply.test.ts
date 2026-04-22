import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  getEurPerUnit: vi.fn<(currency: string, onDate: Date) => Promise<
    { eurPerUnit: string; effectiveDate: Date; source: string } | null
  >>(),
}))

vi.mock("@/models/fx-rates", () => ({
  getEurPerUnit: mocks.getEurPerUnit,
}))

import { applyFxRate } from "@/lib/invoice-pdf-generation"

describe("applyFxRate", () => {
  beforeEach(() => {
    mocks.getEurPerUnit.mockReset()
  })

  it("returns all nulls for EUR invoices without consulting the ECB cache", async () => {
    const result = await applyFxRate({
      currencyCode: "EUR",
      issueDate: new Date("2026-04-22"),
      fxRateToEur: null,
      fxRateDate: null,
    })
    expect(result).toEqual({
      fxRateToEur: null,
      fxRateDate: null,
      fxRateSource: null,
    })
    expect(mocks.getEurPerUnit).not.toHaveBeenCalled()
  })

  it("computes a fresh rate for non-EUR invoices without any stored rate", async () => {
    mocks.getEurPerUnit.mockResolvedValueOnce({
      eurPerUnit: "1.1472000000",
      effectiveDate: new Date("2026-04-22"),
      source: "https://www.ecb.europa.eu",
    })
    const result = await applyFxRate({
      currencyCode: "GBP",
      issueDate: new Date("2026-04-22"),
      fxRateToEur: null,
      fxRateDate: null,
    })
    expect(result.fxRateToEur).toBe("1.1472000000")
    expect(result.fxRateDate).toEqual(new Date("2026-04-22"))
    expect(result.fxRateSource).toBe("https://www.ecb.europa.eu")
    expect(mocks.getEurPerUnit).toHaveBeenCalledWith("GBP", expect.any(Date))
  })

  it("keeps the stored rate when the existing fxRateDate is close enough to issueDate (idempotent on re-save)", async () => {
    const issueDate = new Date("2026-04-27") // Monday
    const fxRateDate = new Date("2026-04-24") // prior Friday (weekend fallback)
    const result = await applyFxRate({
      currencyCode: "GBP",
      issueDate,
      fxRateToEur: "1.1472000000",
      fxRateDate,
      fxRateSource: "https://www.ecb.europa.eu",
    })
    expect(result.fxRateToEur).toBe("1.1472000000")
    expect(result.fxRateDate).toEqual(fxRateDate)
    // Idempotent keep preserves the original attribution URL.
    expect(result.fxRateSource).toBe("https://www.ecb.europa.eu")
    expect(mocks.getEurPerUnit).not.toHaveBeenCalled()
  })

  it("recomputes when the stored fxRateDate is outside the weekend-tolerance window", async () => {
    mocks.getEurPerUnit.mockResolvedValueOnce({
      eurPerUnit: "1.2000000000",
      effectiveDate: new Date("2026-05-15"),
      source: "https://www.ecb.europa.eu",
    })
    const result = await applyFxRate({
      currencyCode: "GBP",
      issueDate: new Date("2026-05-15"),
      fxRateToEur: "1.1000000000", // stale
      fxRateDate: new Date("2026-04-22"), // >3 weeks old
    })
    expect(result.fxRateToEur).toBe("1.2000000000")
    expect(mocks.getEurPerUnit).toHaveBeenCalledTimes(1)
  })

  it("clears any stored rate when the currency is changed to EUR", async () => {
    const result = await applyFxRate({
      currencyCode: "EUR",
      issueDate: new Date("2026-04-22"),
      fxRateToEur: "1.1472000000", // was GBP, now EUR
      fxRateDate: new Date("2026-04-22"),
    })
    expect(result).toEqual({
      fxRateToEur: null,
      fxRateDate: null,
      fxRateSource: null,
    })
  })

  it("returns all nulls when ECB lookup fails, rather than throwing", async () => {
    mocks.getEurPerUnit.mockResolvedValueOnce(null)
    const result = await applyFxRate({
      currencyCode: "GBP",
      issueDate: new Date("2026-04-22"),
      fxRateToEur: null,
      fxRateDate: null,
    })
    expect(result).toEqual({
      fxRateToEur: null,
      fxRateDate: null,
      fxRateSource: null,
    })
  })
})
