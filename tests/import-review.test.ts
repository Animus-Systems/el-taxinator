import { describe, expect, it } from "vitest"

import {
  summarizeImportCandidates,
  validateImportCommit,
} from "@/lib/import-review"

describe("validateImportCommit", () => {
  it("blocks selected rows still in needs_review", () => {
    const result = validateImportCommit([
      {
        rowIndex: 0,
        selected: true,
        status: "needs_review",
        categoryCode: null,
      },
    ])

    expect(result.ok).toBe(false)
    expect(result.errors[0]?.rowIndex).toBe(0)
    expect(result.errors[0]?.code).toBe("needs_review")
  })

  it("requires category for business and business_non_deductible rows", () => {
    const result = validateImportCommit([
      {
        rowIndex: 0,
        selected: true,
        status: "business",
        categoryCode: null,
      },
      {
        rowIndex: 1,
        selected: true,
        status: "business_non_deductible",
        categoryCode: null,
      },
    ])

    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors.map((error) => error.code)).toEqual([
      "missing_category",
      "missing_category",
    ])
  })

  it("allows personal_ignored rows without category", () => {
    const result = validateImportCommit([
      {
        rowIndex: 0,
        selected: true,
        status: "personal_ignored",
        categoryCode: null,
      },
    ])

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe("summarizeImportCandidates", () => {
  it("aggregates selected counts and totals by status", () => {
    const summary = summarizeImportCandidates([
      {
        rowIndex: 0,
        selected: true,
        status: "business",
        // Category required for a business row to NOT be re-classified as
        // needs_review by effectiveReviewStatus — the commit validator treats
        // uncategorised business rows as blockers, so the summary reflects that.
        categoryCode: "office_supplies",
        total: 1000,
        currencyCode: "EUR",
      },
      {
        rowIndex: 1,
        selected: true,
        status: "personal_ignored",
        total: 500,
        currencyCode: "EUR",
      },
    ])

    expect(summary.counts.business).toBe(1)
    expect(summary.counts.personal_ignored).toBe(1)
    expect(summary.totals.business["EUR"]).toBe(1000)
    expect(summary.totals.personal_ignored["EUR"]).toBe(500)
  })

  it("reclassifies uncategorised business rows as needs_review", () => {
    const summary = summarizeImportCandidates([
      {
        rowIndex: 0,
        selected: true,
        status: "business",
        categoryCode: null,
        total: 1000,
        currencyCode: "EUR",
      },
    ])
    expect(summary.counts.business).toBe(0)
    expect(summary.counts.needs_review).toBe(1)
  })

  it("tracks unresolved rows in the summary", () => {
    const summary = summarizeImportCandidates([
      {
        rowIndex: 0,
        selected: true,
        status: "needs_review",
        total: 1000,
        currencyCode: "EUR",
      },
    ])

    expect(summary.counts.needs_review).toBe(1)
    expect(summary.totals.needs_review["EUR"]).toBe(1000)
  })
})
