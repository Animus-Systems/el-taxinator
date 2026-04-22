import { describe, expect, it } from "vitest"
import { suggestNextInvoiceNumber } from "@/lib/invoice-series"

const FALLBACK = "F-FALLBACK-001"

describe("suggestNextInvoiceNumber", () => {
  it("returns the fallback when there are no existing numbers", () => {
    expect(suggestNextInvoiceNumber([], FALLBACK)).toBe(FALLBACK)
  })

  it("returns the fallback when nothing parses", () => {
    expect(
      suggestNextInvoiceNumber(
        [
          { number: "", createdAt: new Date("2026-01-01") },
          { number: "DRAFT", createdAt: new Date("2026-01-02") },
        ],
        FALLBACK,
      ),
    ).toBe(FALLBACK)
  })

  it("returns max+1 within a single series, preserving padding", () => {
    const rows = [
      { number: "F-2026-0001", createdAt: new Date("2026-01-01") },
      { number: "F-2026-0002", createdAt: new Date("2026-01-02") },
      { number: "F-2026-0003", createdAt: new Date("2026-01-03") },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("F-2026-0004")
  })

  it("ignores gaps — always returns max+1 of the chosen series", () => {
    const rows = [
      { number: "F-2026-0001", createdAt: new Date("2026-01-01") },
      { number: "F-2026-0003", createdAt: new Date("2026-01-03") },
      { number: "F-2026-0005", createdAt: new Date("2026-01-05") },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("F-2026-0006")
  })

  it("picks the series whose most recent row is newest", () => {
    const rows = [
      // Older series — higher ord but not recent.
      { number: "F-2025-0099", createdAt: new Date("2025-12-31") },
      { number: "F-2025-0100", createdAt: new Date("2025-12-31") },
      // Newer series — lower ord but more recent.
      { number: "F-2026-0001", createdAt: new Date("2026-04-10") },
      { number: "F-2026-0002", createdAt: new Date("2026-04-11") },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("F-2026-0003")
  })

  it("breaks ties on recency by preferring the series with the higher max ord", () => {
    const sameDay = new Date("2026-04-22T10:00:00Z")
    const rows = [
      { number: "A-0003", createdAt: sameDay },
      { number: "B-0007", createdAt: sameDay },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("B-0008")
  })

  it("preserves the widest padding observed in the chosen series", () => {
    const rows = [
      { number: "F-2026-1", createdAt: new Date("2026-01-01") },
      { number: "F-2026-0042", createdAt: new Date("2026-04-01") },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("F-2026-0043")
  })

  it("skips unparseable rows without breaking the suggestion", () => {
    const rows = [
      { number: "", createdAt: new Date("2026-04-22") },
      { number: "F-2026-0007", createdAt: new Date("2026-04-21") },
    ]
    expect(suggestNextInvoiceNumber(rows, FALLBACK)).toBe("F-2026-0008")
  })
})
