import { describe, expect, it } from "vitest"
import { applyCSVMapping } from "@/ai/import-csv"
import type { CSVColumnMapping } from "@/ai/import-csv"

const SWISSBORG_MAPPING: CSVColumnMapping = {
  bank: "SwissBorg",
  bankConfidence: 0.95,
  columnMapping: {
    "Time in UTC": "issuedAt",
    "Net amount (EUR)": "total",
    "Note": "description",
    "Type": "type",
    "Currency": "cryptoAsset",
    "Gross amount": "cryptoQuantity",
    "Gross amount (EUR)": "cryptoGrossAmountEur",
    "Fee (EUR)": "cryptoFeeEur",
    "name": "concat:Type+Currency",
    "merchant": "const:SwissBorg",
    "currencyCode": "const:EUR",
  },
  dateFormat: "yyyy-MM-dd HH:mm:ss",
  amountFormat: "absolute_with_type",
  skipRows: [],
}

describe("applyCSVMapping with crypto columns", () => {
  it("populates extra.crypto from cryptoAsset + cryptoQuantity + cryptoGrossAmountEur", () => {
    const headers = [
      "Local time", "Time in UTC", "Type", "Currency",
      "Gross amount", "Gross amount (EUR)", "Fee", "Fee (EUR)",
      "Net amount", "Net amount (EUR)", "Note",
    ]
    const rows = [
      [
        "2025-07-13 18:55",
        "2025-07-13 16:55:07",
        "Sell",
        "ETH",
        "0.545",
        "1945.60",
        "0.002",
        "5.00",
        "0.543",
        "1940.60",
        "Exchanged to 1940.73 EUR",
      ],
    ]

    const [candidate] = applyCSVMapping(headers, rows, SWISSBORG_MAPPING, "EUR")
    expect(candidate).toBeDefined()
    if (!candidate) throw new Error("expected candidate")

    expect(candidate.total).toBe(194060) // 1940.60 EUR → cents
    expect(candidate.extra?.crypto).toBeDefined()
    const crypto = candidate.extra?.crypto as Record<string, unknown>
    expect(crypto["asset"]).toBe("ETH")
    expect(crypto["quantity"]).toBe("0.545")
    // pricePerUnit = 1945.60 EUR / 0.545 ≈ 3570 EUR/ETH → 357_000 cents
    expect(crypto["pricePerUnit"]).toBe(Math.round(194560 / 0.545))
    expect(crypto["feesCents"]).toBe(500) // 5.00 EUR → 500 cents
  })

  it("omits extra.crypto when the asset column is empty", () => {
    const headers = [
      "Local time", "Time in UTC", "Type", "Currency",
      "Gross amount", "Gross amount (EUR)", "Fee (EUR)", "Net amount (EUR)", "Note",
    ]
    const rows = [
      ["2025-01-01", "2025-01-01 00:00:00", "Fee Adjustment", "", "", "", "", "1.00", "internal fee"],
    ]

    const [candidate] = applyCSVMapping(headers, rows, SWISSBORG_MAPPING, "EUR")
    expect(candidate).toBeDefined()
    if (!candidate) throw new Error("expected candidate")
    expect(candidate.extra?.crypto).toBeUndefined()
  })

  it("uppercases the asset ticker", () => {
    const headers = [
      "Local time", "Time in UTC", "Type", "Currency",
      "Gross amount", "Gross amount (EUR)", "Fee (EUR)", "Net amount (EUR)", "Note",
    ]
    const rows = [
      ["2025-01-01", "2025-01-01 00:00:00", "Sell", "btc", "0.001", "65.00", "", "64.00", ""],
    ]

    const [candidate] = applyCSVMapping(headers, rows, SWISSBORG_MAPPING, "EUR")
    if (!candidate) throw new Error("expected candidate")
    const crypto = candidate.extra?.crypto as Record<string, unknown>
    expect(crypto["asset"]).toBe("BTC")
  })

  it("does not compute pricePerUnit when quantity is zero or missing", () => {
    const headers = [
      "Local time", "Time in UTC", "Type", "Currency",
      "Gross amount", "Gross amount (EUR)", "Fee (EUR)", "Net amount (EUR)", "Note",
    ]
    const rows = [
      ["2025-01-01", "2025-01-01 00:00:00", "Airdrop", "BORG", "", "", "", "0.00", ""],
    ]
    const [candidate] = applyCSVMapping(headers, rows, SWISSBORG_MAPPING, "EUR")
    if (!candidate) throw new Error("expected candidate")
    const crypto = candidate.extra?.crypto as Record<string, unknown> | undefined
    // Asset is present, but no quantity → we keep the object with just the
    // asset ticker (partial is better than nothing — the wizard / backfill
    // can fill in quantity later).
    expect(crypto?.["asset"]).toBe("BORG")
    expect(crypto?.["quantity"]).toBeUndefined()
    expect(crypto?.["pricePerUnit"]).toBeUndefined()
  })
})
