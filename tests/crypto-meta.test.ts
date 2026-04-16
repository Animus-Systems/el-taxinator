import { describe, expect, it } from "vitest"

import type { TransactionCandidate } from "@/ai/import-csv"
import type { CandidateUpdate } from "@/lib/db-types"
import {
  accountTypeSchema,
  bankAccountSchema,
  candidateUpdateSchema,
  cryptoMetaSchema,
} from "@/lib/db-types"
import { applyCandidateUpdates } from "@/ai/wizard"

function makeCandidate(overrides: Partial<TransactionCandidate> = {}): TransactionCandidate {
  return {
    rowIndex: 0,
    name: "Swissborg withdrawal",
    merchant: "Swissborg",
    description: null,
    total: 275000,
    currencyCode: "EUR",
    type: "income",
    categoryCode: null,
    projectCode: null,
    accountId: null,
    issuedAt: "2026-03-15",
    status: "needs_review",
    suggestedStatus: null,
    confidence: { category: 0, type: 0, status: 0, overall: 0 },
    selected: true,
    ...overrides,
  }
}

describe("accountTypeSchema", () => {
  it("accepts the five supported account types", () => {
    for (const value of ["bank", "credit_card", "crypto_exchange", "crypto_wallet", "cash"]) {
      expect(accountTypeSchema.safeParse(value).success).toBe(true)
    }
  })

  it("rejects unknown account types", () => {
    expect(accountTypeSchema.safeParse("chequing").success).toBe(false)
  })

  it("is required on bankAccountSchema", () => {
    const missing = bankAccountSchema.safeParse({
      id: "a",
      userId: "u",
      name: "BBVA",
      bankName: null,
      currencyCode: "EUR",
      accountNumber: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(missing.success).toBe(false)
  })
})

describe("cryptoMetaSchema", () => {
  it("parses a fully-populated disposal payload", () => {
    const parsed = cryptoMetaSchema.safeParse({
      asset: "BTC",
      quantity: "0.05",
      pricePerUnit: 5500000,
      costBasisPerUnit: 3500000,
      costBasisSource: "manual",
      realizedGainCents: 100000,
      fxRate: 1,
      gatewayTransactionId: null,
      fingerprint: "swissborg:2026-03-15:0.05BTC",
    })
    expect(parsed.success).toBe(true)
  })

  it("defaults costBasisSource to manual", () => {
    const parsed = cryptoMetaSchema.parse({
      asset: "ETH",
      quantity: "1.5",
      pricePerUnit: null,
      costBasisPerUnit: null,
      realizedGainCents: null,
      fxRate: null,
      gatewayTransactionId: null,
      fingerprint: null,
    })
    expect(parsed.costBasisSource).toBe("manual")
  })
})

describe("candidateUpdateSchema extra passthrough", () => {
  it("accepts extra.crypto with partial metadata", () => {
    const parsed = candidateUpdateSchema.safeParse({
      rowIndex: 0,
      categoryCode: "crypto_disposal",
      extra: { crypto: { asset: "BTC", quantity: "0.05", pricePerUnit: 5500000 } },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.extra?.crypto?.asset).toBe("BTC")
    }
  })

  it("allows updates with no extra at all", () => {
    const parsed = candidateUpdateSchema.safeParse({ rowIndex: 0, status: "business" })
    expect(parsed.success).toBe(true)
  })
})

describe("applyCandidateUpdates merges crypto meta", () => {
  it("populates extra.crypto and computes realizedGainCents", () => {
    const candidates = [makeCandidate()]
    const update: CandidateUpdate = {
      rowIndex: 0,
      categoryCode: "crypto_disposal",
      status: "needs_review",
      extra: {
        crypto: {
          asset: "BTC",
          quantity: "0.05",
          // €55,000/BTC proceeds, €35,000/BTC cost basis, 0.05 BTC
          pricePerUnit: 5500000,
          costBasisPerUnit: 3500000,
        },
      },
    }

    applyCandidateUpdates(candidates, [update], [])

    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    const meta = c0.extra?.crypto
    expect(meta?.asset).toBe("BTC")
    expect(meta?.quantity).toBe("0.05")
    expect(meta?.pricePerUnit).toBe(5500000)
    expect(meta?.costBasisPerUnit).toBe(3500000)
    // (5_500_000 - 3_500_000) * 0.05 = 100_000 cents (€1,000.00 gain)
    expect(meta?.realizedGainCents).toBe(100000)
    expect(c0.categoryCode).toBe("crypto_disposal")
  })

  it("leaves realizedGainCents null when cost basis is unknown", () => {
    const candidates = [makeCandidate()]
    const update: CandidateUpdate = {
      rowIndex: 0,
      extra: {
        crypto: { asset: "ETH", quantity: "1.5", pricePerUnit: 250000 },
      },
    }

    applyCandidateUpdates(candidates, [update], [])

    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    const meta = c0.extra?.crypto
    expect(meta?.costBasisPerUnit).toBeUndefined()
    expect(meta?.realizedGainCents).toBeNull()
  })

  it("merges a follow-up cost-basis update into existing crypto meta", () => {
    const candidates = [makeCandidate()]
    applyCandidateUpdates(
      candidates,
      [
        {
          rowIndex: 0,
          extra: { crypto: { asset: "BTC", quantity: "0.1", pricePerUnit: 5500000 } },
        },
      ],
      [],
    )
    applyCandidateUpdates(
      candidates,
      [
        {
          rowIndex: 0,
          extra: { crypto: { costBasisPerUnit: 4500000 } },
        },
      ],
      [],
    )
    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    const meta = c0.extra?.crypto
    // Should preserve asset/quantity/price from the first update.
    expect(meta?.asset).toBe("BTC")
    expect(meta?.quantity).toBe("0.1")
    expect(meta?.pricePerUnit).toBe(5500000)
    expect(meta?.costBasisPerUnit).toBe(4500000)
    // (5_500_000 - 4_500_000) * 0.1 = 100_000 cents
    expect(meta?.realizedGainCents).toBe(100000)
  })

  it("does not touch extra when the update omits it", () => {
    const candidates = [makeCandidate()]
    applyCandidateUpdates(
      candidates,
      [
        {
          rowIndex: 0,
          extra: { crypto: { asset: "BTC", quantity: "0.01" } },
        },
      ],
      [],
    )
    applyCandidateUpdates(
      candidates,
      [{ rowIndex: 0, status: "business" }],
      [],
    )
    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    expect(c0.extra?.crypto?.asset).toBe("BTC")
    expect(c0.status).toBe("business")
  })
})
