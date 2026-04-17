import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  withTransaction: vi.fn(),
  queryMany: vi.fn(),
}))

vi.mock("@/lib/sql", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sql")>("@/lib/sql")
  return {
    ...actual,
    withTransaction: mocks.withTransaction,
    queryMany: mocks.queryMany,
  }
})

import { linkTransferPair, unlinkTransfer, maybePairNewTransaction } from "@/models/transfers"
import type { Transaction } from "@/lib/db-types"

describe("linkTransferPair", () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset()
    mocks.withTransaction.mockReset()
    mocks.withTransaction.mockImplementation(async (fn) => fn({ query: mocks.clientQuery }))
  })

  it("updates both rows with a shared transfer_id and opposite directions", async () => {
    const result = await linkTransferPair({
      userId: "u1",
      outgoingId: "tx-out",
      outgoingAccountId: "acc-out",
      incomingId: "tx-in",
      incomingAccountId: "acc-in",
    })

    expect(mocks.withTransaction).toHaveBeenCalledOnce()
    expect(mocks.clientQuery).toHaveBeenCalledTimes(2)
    expect(result.transferId).toMatch(/^[0-9a-f-]{36}$/i)
  })
})

describe("unlinkTransfer", () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset()
    mocks.withTransaction.mockReset()
    mocks.withTransaction.mockImplementation(async (fn) => fn({ query: mocks.clientQuery }))
  })

  it("clears transfer fields and restores pre-migration type when present", async () => {
    await unlinkTransfer({ userId: "u1", transferId: "pair-123" })
    expect(mocks.withTransaction).toHaveBeenCalledOnce()
    expect(mocks.clientQuery).toHaveBeenCalled()
  })
})

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    userId: "u1",
    name: null,
    description: null,
    merchant: null,
    total: 1000,
    currencyCode: "EUR",
    convertedTotal: null,
    convertedCurrencyCode: null,
    type: "expense",
    items: [],
    note: null,
    files: [],
    extra: null,
    categoryCode: null,
    projectCode: null,
    issuedAt: new Date("2026-03-05"),
    createdAt: new Date(),
    updatedAt: new Date(),
    text: null,
    deductible: null,
    accountId: "acc-1",
    status: "business",
    appliedRuleId: null,
    transferId: null,
    counterAccountId: null,
    transferDirection: null,
    ...overrides,
  } as Transaction
}

describe("maybePairNewTransaction", () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset()
    mocks.withTransaction.mockReset()
    mocks.queryMany.mockReset()
    mocks.withTransaction.mockImplementation(async (fn) => fn({ query: mocks.clientQuery }))
  })

  it("no-ops when type is other", async () => {
    await maybePairNewTransaction(makeTx({ type: "other" }))
    expect(mocks.withTransaction).not.toHaveBeenCalled()
    expect(mocks.queryMany).not.toHaveBeenCalled()
  })

  it("no-ops when accountId is missing", async () => {
    await maybePairNewTransaction(makeTx({ accountId: null }))
    expect(mocks.withTransaction).not.toHaveBeenCalled()
    expect(mocks.queryMany).not.toHaveBeenCalled()
  })

  it("no-ops when the matcher returns none", async () => {
    mocks.queryMany.mockResolvedValueOnce([])
    await maybePairNewTransaction(makeTx({}))
    expect(mocks.queryMany).toHaveBeenCalledOnce()
    expect(mocks.withTransaction).not.toHaveBeenCalled()
  })

  it("links when matcher returns a unique match", async () => {
    mocks.queryMany.mockResolvedValueOnce([
      makeTx({
        id: "t-other",
        accountId: "acc-2",
        type: "income",
      }),
    ])
    await maybePairNewTransaction(makeTx({ type: "expense" }))
    expect(mocks.queryMany).toHaveBeenCalledOnce()
    expect(mocks.withTransaction).toHaveBeenCalledOnce()
    expect(mocks.clientQuery).toHaveBeenCalledTimes(2)
  })
})
