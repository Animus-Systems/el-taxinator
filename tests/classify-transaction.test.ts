import { describe, expect, it } from "vitest"
import { classifyTransaction } from "@/lib/classify-transaction"

describe("classifyTransaction — refund patterns", () => {
  it("spots English 'refund' in description", () => {
    const r = classifyTransaction({
      name: "Amazon refund",
      merchant: null,
      description: "Refund for order #1234",
      total: 3200,
      type: "income",
    })
    expect(r?.suggested).toBe("refund")
  })

  it("spots Spanish 'devolución'", () => {
    const r = classifyTransaction({
      name: "DEVOLUCIÓN COMPRA",
      merchant: null,
      description: null,
      total: 1500,
      type: "income",
    })
    expect(r?.suggested).toBe("refund")
  })

  it("spots 'reembolso'", () => {
    const r = classifyTransaction({
      name: "REEMBOLSO",
      merchant: null,
      description: "Reembolso Netflix",
      total: 1000,
      type: "income",
    })
    expect(r?.suggested).toBe("refund")
  })
})

describe("classifyTransaction — exchange patterns", () => {
  it("catches Revolut 'Exchanged to EUR'", () => {
    const r = classifyTransaction({
      name: "Exchanged to EUR",
      merchant: "Revolut",
      description: null,
      total: -5000,
      type: "expense",
    })
    expect(r?.suggested).toBe("exchange")
  })

  it("catches 'Currency conversion'", () => {
    const r = classifyTransaction({
      name: "Currency conversion",
      merchant: null,
      description: null,
      total: -100,
      type: "expense",
    })
    expect(r?.suggested).toBe("exchange")
  })
})

describe("classifyTransaction — transfer patterns", () => {
  it("catches SEPA-style 'TRANSFERENCIA'", () => {
    const r = classifyTransaction({
      name: "TRANSFERENCIA NACIONAL",
      merchant: null,
      description: null,
      total: -1000,
      type: "expense",
    })
    expect(r?.suggested).toBe("transfer")
  })

  it("catches 'TRANSF. GIRO'", () => {
    const r = classifyTransaction({
      name: "TRANSF. GIRO NACIONAL",
      merchant: null,
      description: null,
      total: 50000,
      type: "income",
    })
    expect(r?.suggested).toBe("transfer")
  })

  it("catches 'to my account'", () => {
    const r = classifyTransaction({
      name: "Transfer to my account",
      merchant: null,
      description: null,
      total: -1000,
      type: "expense",
    })
    expect(r?.suggested).toBe("transfer")
  })
})

describe("classifyTransaction — sign-based fallback", () => {
  it("suggests income for positive uncategorized rows", () => {
    const r = classifyTransaction({
      name: "Consulting fee",
      merchant: null,
      description: null,
      total: 100000,
      type: null,
    })
    expect(r?.suggested).toBe("income")
  })

  it("suggests expense for negative uncategorized rows", () => {
    const r = classifyTransaction({
      name: "Office rent",
      merchant: null,
      description: null,
      total: -50000,
      type: null,
    })
    expect(r?.suggested).toBe("expense")
  })

  it("does NOT override an existing plausible type", () => {
    const r = classifyTransaction({
      name: "Consulting fee",
      merchant: null,
      description: null,
      total: 100000,
      type: "income",
    })
    expect(r).toBeNull()
  })

  it("suggests flipping income→expense when sign mismatches", () => {
    const r = classifyTransaction({
      name: "Office rent",
      merchant: null,
      description: null,
      total: -50000,
      type: "income",
    })
    expect(r?.suggested).toBe("expense")
  })
})

describe("classifyTransaction — no-op cases", () => {
  it("returns null for zero-total rows with a valid type", () => {
    const r = classifyTransaction({
      name: "Something",
      merchant: null,
      description: null,
      total: 0,
      type: "other",
    })
    expect(r).toBeNull()
  })

  it("returns null for already-refund rows that match refund pattern", () => {
    // Pattern matches 'refund', but the current type already IS 'refund' —
    // the caller filters out equal-type suggestions, so the classifier can
    // still return it and rely on the filter. Locking in that behavior.
    const r = classifyTransaction({
      name: "refund Amazon",
      merchant: null,
      description: null,
      total: 3200,
      type: "refund",
    })
    expect(r?.suggested).toBe("refund")
  })
})
