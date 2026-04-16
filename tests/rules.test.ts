import { describe, expect, it } from "vitest"

import type { TransactionCandidate } from "@/ai/import-csv"
import { applyRulesToCandidates } from "@/models/rules"

describe("applyRulesToCandidates", () => {
  it("stores manual rule status suggestions without resolving the row", () => {
    const candidates: TransactionCandidate[] = [
      {
        rowIndex: 0,
        name: "Spotify",
        merchant: "Spotify",
        description: null,
        total: 1599,
        currencyCode: "EUR",
        type: "expense",
        categoryCode: null,
        projectCode: null,
        accountId: null,
        issuedAt: "2026-04-01",
        status: "needs_review",
        suggestedStatus: null,
        confidence: { category: 0, type: 0, status: 0, overall: 0 },
        selected: true,
      },
    ]

    applyRulesToCandidates(candidates, [
      {
        id: "rule-1",
        userId: "user-1",
        name: "Spotify software",
        matchField: "merchant",
        matchType: "exact",
        matchValue: "Spotify",
        categoryCode: "software",
        projectCode: null,
        type: "expense",
        status: "business",
        note: null,
        priority: 0,
        source: "manual",
        confidence: 1,
        isActive: true,
        createdAt: new Date("2026-04-14T00:00:00.000Z"),
        updatedAt: new Date("2026-04-14T00:00:00.000Z"),
      },
    ] as never)

    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    expect(c0.status).toBe("needs_review")
    expect(c0.suggestedStatus).toBe("business")
    expect(c0.categoryCode).toBe("software")
    expect(c0.ruleMatched).toBe(true)
    expect(c0.confidence.status).toBe(1)
  })

  it("prioritizes manual rules over learned rules for the same candidate", () => {
    const candidates: TransactionCandidate[] = [
      {
        rowIndex: 0,
        name: "Spotify",
        merchant: "Spotify",
        description: null,
        total: 1599,
        currencyCode: "EUR",
        type: "expense",
        categoryCode: null,
        projectCode: null,
        accountId: null,
        issuedAt: "2026-04-01",
        status: "needs_review",
        suggestedStatus: null,
        confidence: { category: 0, type: 0, status: 0, overall: 0 },
        selected: true,
      },
    ]

    applyRulesToCandidates(candidates, [
      {
        id: "learned-rule",
        userId: "user-1",
        name: "Learned Spotify",
        matchField: "merchant",
        matchType: "exact",
        matchValue: "Spotify",
        categoryCode: "entertainment",
        projectCode: null,
        type: "expense",
        status: "personal_ignored",
        note: null,
        priority: 100,
        source: "learned",
        confidence: 0.4,
        isActive: true,
        createdAt: new Date("2026-04-14T00:00:00.000Z"),
        updatedAt: new Date("2026-04-14T00:00:00.000Z"),
      },
      {
        id: "manual-rule",
        userId: "user-1",
        name: "Manual Spotify",
        matchField: "merchant",
        matchType: "exact",
        matchValue: "Spotify",
        categoryCode: "software",
        projectCode: null,
        type: "expense",
        status: "business",
        note: null,
        priority: 0,
        source: "manual",
        confidence: 1,
        isActive: true,
        createdAt: new Date("2026-04-14T00:00:00.000Z"),
        updatedAt: new Date("2026-04-14T00:00:00.000Z"),
      },
    ] as never)

    const [c0] = candidates
    expect(c0).toBeDefined()
    if (!c0) throw new Error("expected candidate")
    expect(c0.categoryCode).toBe("software")
    expect(c0.suggestedStatus).toBe("business")
  })
})
