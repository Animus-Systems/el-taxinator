import { describe, expect, it } from "vitest"

import type { TransactionCandidate } from "@/ai/import-csv"
import {
  buildWizardPrompt,
  collectHintedRowIndexes,
  pickFocusedCandidates,
  type WizardPromptInput,
} from "@/ai/wizard-prompt"

function makeCandidate(overrides: Partial<TransactionCandidate> = {}): TransactionCandidate {
  return {
    rowIndex: 0,
    name: null,
    merchant: null,
    description: null,
    total: 0,
    currencyCode: "EUR",
    type: "expense",
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

function makeInput(overrides: Partial<WizardPromptInput>): WizardPromptInput {
  return {
    entityType: "autonomo",
    businessName: null,
    locale: "en",
    businessFacts: [],
    categories: [],
    projects: [],
    accounts: [],
    rules: [],
    knowledgePacks: [],
    candidates: [],
    focusRowIndexes: null,
    messages: [],
    userMessage: "",
    defaultAccountId: null,
    ...overrides,
  }
}

describe("pickFocusedCandidates — amount hint", () => {
  it("force-includes a classified candidate whose total matches a decimal amount in the user message", () => {
    const classified = makeCandidate({
      rowIndex: 7,
      merchant: "Ewelina Kowalska",
      total: -25425, // -254.25 PLN
      currencyCode: "PLN",
      status: "business", // normally elided — not needs_review
    })
    const other = makeCandidate({ rowIndex: 2, status: "business" })

    const { focused } = pickFocusedCandidates(
      [classified, other],
      null,
      "please fix the 254.25 PLN Ewelina transaction",
    )

    const indexes = focused.map((c) => c.rowIndex)
    expect(indexes).toContain(7)
    expect(indexes).not.toContain(2)
  })

  it("matches when the user writes the amount with a comma as decimal separator", () => {
    const classified = makeCandidate({
      rowIndex: 4,
      total: -25425,
      status: "personal_ignored",
    })
    const { focused } = pickFocusedCandidates([classified], null, "row for 254,25 PLN")
    expect(focused.map((c) => c.rowIndex)).toEqual([4])
  })

  it("matches the bare integer against the euro/unit amount", () => {
    const classified = makeCandidate({
      rowIndex: 9,
      total: 25400, // 254.00 EUR
      status: "business",
    })
    const { focused } = pickFocusedCandidates([classified], null, "tell me about 254")
    expect(focused.map((c) => c.rowIndex)).toContain(9)
  })
})

describe("pickFocusedCandidates — name hint", () => {
  it("force-includes a classified candidate whose merchant matches a token in the message", () => {
    const classified = makeCandidate({
      rowIndex: 3,
      merchant: "Ewelina Kowalska",
      status: "business",
    })
    const unrelated = makeCandidate({
      rowIndex: 5,
      merchant: "Mercadona",
      status: "business",
    })

    const { focused } = pickFocusedCandidates(
      [classified, unrelated],
      null,
      "what's up with the Ewelina row?",
    )

    const indexes = focused.map((c) => c.rowIndex)
    expect(indexes).toContain(3)
    expect(indexes).not.toContain(5)
  })

  it("matches tokens against name and description as well as merchant", () => {
    const byName = makeCandidate({
      rowIndex: 1,
      name: "Zurich Insurance Premium",
      status: "business",
    })
    const byDescription = makeCandidate({
      rowIndex: 2,
      description: "Annual Zurich renewal",
      status: "business",
    })
    const { focused } = pickFocusedCandidates(
      [byName, byDescription],
      null,
      "zurich invoices please",
    )
    const indexes = focused.map((c) => c.rowIndex)
    expect(indexes).toContain(1)
    expect(indexes).toContain(2)
  })
})

describe("pickFocusedCandidates — stopwords", () => {
  it("does not match candidates on stopwords like pln, eur, the, from", () => {
    const plnRow = makeCandidate({ rowIndex: 1, merchant: "pln holdings", status: "business" })
    const eurRow = makeCandidate({ rowIndex: 2, merchant: "EUR services", status: "business" })
    const theRow = makeCandidate({ rowIndex: 3, merchant: "The Company", status: "business" })
    const fromRow = makeCandidate({ rowIndex: 4, description: "from abroad", status: "business" })

    const hinted = collectHintedRowIndexes(
      [plnRow, eurRow, theRow, fromRow],
      "the transaction from PLN to EUR",
    )
    expect(hinted.size).toBe(0)

    const { focused } = pickFocusedCandidates(
      [plnRow, eurRow, theRow, fromRow],
      null,
      "the transaction from PLN to EUR",
    )
    expect(focused).toEqual([])
  })
})

describe("buildWizardPrompt integration", () => {
  it("includes hinted row in the rendered prompt even when status is classified", () => {
    const classified = makeCandidate({
      rowIndex: 42,
      merchant: "Ewelina Kowalska",
      total: -25425,
      currencyCode: "PLN",
      status: "business",
    })
    const needs = makeCandidate({ rowIndex: 1, merchant: "Mercadona", status: "needs_review" })

    const { prompt, focusedCount } = buildWizardPrompt(
      makeInput({
        candidates: [classified, needs],
        userMessage: "please fix the 254.25 PLN Ewelina transaction",
      }),
    )

    expect(prompt).toContain("row=42")
    expect(prompt).toContain("row=1")
    expect(focusedCount).toBe(2)
  })
})
