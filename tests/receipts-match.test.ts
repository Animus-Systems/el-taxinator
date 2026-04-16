import { describe, expect, it, vi } from "vitest"

const llmCalls: Array<{ prompt: string }> = []

vi.mock("@/ai/providers/llmProvider", () => ({
  requestLLM: vi.fn(async (_settings: unknown, req: { prompt: string }) => {
    llmCalls.push({ prompt: req.prompt })
    return { output: { matches: [] }, error: null }
  }),
}))

vi.mock("@/models/settings", () => ({
  getSettings: vi.fn(async () => ({})),
  getLLMSettings: vi.fn(() => ({})),
}))

import { matchReceiptsToTransactions } from "@/ai/match-receipts"

describe("matchReceiptsToTransactions", () => {
  it("returns [] when there are no receipts or transactions", async () => {
    const empty = await matchReceiptsToTransactions([], [], [], "u1")
    expect(empty).toEqual([])
    expect(llmCalls).toHaveLength(0)
  })

  it("pre-matches via alias without calling the LLM when the pairing is unique", async () => {
    llmCalls.length = 0

    const receipts = [
      { fileId: "f1", vendor: "Leroy Merlin S.L.", totalCents: 5000, date: "2026-04-10" },
    ]
    const transactions = [
      {
        id: "tx-1",
        name: null,
        merchant: "LEROY MERLIN",
        totalCents: 5000,
        date: "2026-04-10",
        currencyCode: "EUR",
      },
      {
        id: "tx-2",
        name: null,
        merchant: "MERCADONA",
        totalCents: 3000,
        date: "2026-04-09",
        currencyCode: "EUR",
      },
    ]
    const aliases = [
      { vendorPattern: "leroy merlin", merchantPattern: "leroy merlin" },
    ]

    const result = await matchReceiptsToTransactions(receipts, transactions, aliases, "u1")

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      fileId: "f1",
      transactionId: "tx-1",
      confidence: 0.95,
    })
    expect(result[0]!.reasoning).toContain("alias")
    // Deterministic path should not have invoked the LLM.
    expect(llmCalls).toHaveLength(0)
  })

  it("falls back to the LLM when an alias is ambiguous (>1 candidate tx)", async () => {
    llmCalls.length = 0

    const receipts = [
      { fileId: "f1", vendor: "Leroy Merlin", totalCents: 5000, date: "2026-04-10" },
    ]
    const transactions = [
      {
        id: "tx-1",
        name: null,
        merchant: "LEROY MERLIN BARCELONA",
        totalCents: 5000,
        date: "2026-04-10",
        currencyCode: "EUR",
      },
      {
        id: "tx-2",
        name: null,
        merchant: "LEROY MERLIN MADRID",
        totalCents: 5000,
        date: "2026-04-11",
        currencyCode: "EUR",
      },
    ]
    const aliases = [
      { vendorPattern: "leroy merlin", merchantPattern: "leroy merlin" },
    ]

    await matchReceiptsToTransactions(receipts, transactions, aliases, "u1")

    // Alias cannot disambiguate → must defer to LLM.
    expect(llmCalls).toHaveLength(1)
    expect(llmCalls[0]!.prompt).toContain("RECEIPTS")
  })
})
