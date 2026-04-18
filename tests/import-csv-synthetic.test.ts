import { describe, it, expect } from "vitest"
import { applyCSVMapping } from "@/ai/import-csv"

const mapping = {
  bank: "SwissBorg",
  bankConfidence: 0.95,
  columnMapping: {
    "Time in UTC": "issuedAt",
    "Net amount (EUR)": "total",
    "Note": "description",
    "Type": "type",
    "name": "concat:Type+Currency",
    "merchant": "const:SwissBorg",
    "currencyCode": "const:EUR",
  },
  dateFormat: "yyyy-MM-dd HH:mm:ss",
  amountFormat: "negative_expense" as const,
  skipRows: [],
}

const headers = [
  "Local time", "Time in UTC", "Type", "Currency",
  "Gross amount", "Gross amount (EUR)", "Fee", "Fee (EUR)",
  "Net amount", "Net amount (EUR)", "Note",
]
const rows = [
  ["2025-07-13 17:55:07", "2025-07-13 16:55:07", "Sell", "ETH", "0.7645", "1945.60", "0", "0", "0.7645", "1945.60", "Exchanged to 1940.73 EUR"],
  ["2025-07-13 17:55:07", "2025-07-13 16:55:07", "Buy", "EUR", "1945.60", "1945.60", "4.86", "4.86", "1940.74", "1940.74", "Exchanged from 0.7645 ETH"],
]

describe("applyCSVMapping with synthetic values", () => {
  it("uses const: for merchant and currencyCode", () => {
    const out = applyCSVMapping(headers, rows, mapping, "USD")
    expect(out).toHaveLength(2)
    expect(out[0]!.merchant).toBe("SwissBorg")
    expect(out[0]!.currencyCode).toBe("EUR")
    expect(out[1]!.merchant).toBe("SwissBorg")
    expect(out[1]!.currencyCode).toBe("EUR")
  })

  it("concatenates Type + Currency into name", () => {
    const out = applyCSVMapping(headers, rows, mapping, "USD")
    expect(out[0]!.name).toBe("Sell ETH")
    expect(out[1]!.name).toBe("Buy EUR")
  })

  it("skips concat segments that are empty", () => {
    const sparseRows = [
      ["", "", "Deposit", "", "", "100", "0", "0", "", "100", "Incoming"],
    ]
    const out = applyCSVMapping(headers, sparseRows, mapping, "USD")
    expect(out[0]!.name).toBe("Deposit")
  })
})
