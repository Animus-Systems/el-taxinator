import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/models/income-sources", () => ({
  listIncomeSources: vi.fn(),
  getIncomeSourceById: vi.fn(),
  createIncomeSource: vi.fn(),
  updateIncomeSource: vi.fn(),
  deleteIncomeSource: vi.fn(),
  getIncomeSourceTotals: vi.fn(),
  listIncomeSourceYears: vi.fn(),
  listTransactionsBySource: vi.fn(),
  listUnlinkedDepositsForSource: vi.fn(),
  setTransactionIncomeSource: vi.fn(),
}))
vi.mock("@/lib/entities", () => ({
  getActiveEntityId: vi.fn(async () => "entity-1"),
  getEntityById: vi.fn(() => ({ id: "entity-1", name: "Entity 1" })),
}))
vi.mock("@/lib/shared-income-sources", () => ({
  listSharedIncomeSources: vi.fn(async () => []),
  recordSharedIncomeSource: vi.fn(),
  forgetSharedIncomeSource: vi.fn(),
}))

import { incomeSourcesRouter } from "@/lib/trpc/routers/income-sources"
import {
  getIncomeSourceById,
  listTransactionsBySource,
  listUnlinkedDepositsForSource,
  setTransactionIncomeSource,
} from "@/models/income-sources"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SOURCE_ID = "00000000-0000-0000-0000-0000000000aa"
const TX_ID = "00000000-0000-0000-0000-0000000000bb"
const ctx = { user: { id: USER_ID } }

function caller() {
  return incomeSourcesRouter.createCaller(
    ctx as unknown as Parameters<typeof incomeSourcesRouter.createCaller>[0],
  )
}

function makeSource(overrides: Partial<Awaited<ReturnType<typeof getIncomeSourceById>>> = {}) {
  return {
    id: SOURCE_ID,
    userId: USER_ID,
    kind: "salary" as const,
    name: "Animus Systems SL",
    taxId: "B12345678",
    metadata: {},
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe("incomeSources.detail", () => {
  beforeEach(() => {
    vi.mocked(getIncomeSourceById).mockReset()
    vi.mocked(listTransactionsBySource).mockReset()
  })

  it("rolls up monthly buckets and flags completeness issues", async () => {
    vi.mocked(getIncomeSourceById).mockResolvedValue(makeSource({ taxId: null }))
    vi.mocked(listTransactionsBySource).mockResolvedValue([
      // Jan: has payslip (extra.payslip present)
      {
        id: "tx-1",
        issuedAt: "2025-01-28T00:00:00.000Z",
        name: "Nómina",
        merchant: "Animus Systems SL",
        description: null,
        total: 105000,
        currencyCode: "EUR",
        status: "personal_taxable",
        fileIds: [],
        grossCents: 120000,
        irpfWithheldCents: 15000,
        ssEmployeeCents: 0,
        payslipPeriodStart: "2025-01-01",
        payslipPeriodEnd: "2025-01-31",
      },
      // Feb: plain deposit, no payslip
      {
        id: "tx-2",
        issuedAt: "2025-02-28T00:00:00.000Z",
        name: "Transfer",
        merchant: "Animus Systems SL",
        description: null,
        total: 105000,
        currencyCode: "EUR",
        status: "personal_taxable",
        fileIds: [],
        grossCents: null,
        irpfWithheldCents: null,
        ssEmployeeCents: null,
        payslipPeriodStart: null,
        payslipPeriodEnd: null,
      },
    ])

    const res = await caller().detail({ id: SOURCE_ID, year: 2025 })

    expect(res.source.id).toBe(SOURCE_ID)
    expect(res.transactions).toHaveLength(2)
    expect(res.transactions[0]!.hasPayslip).toBe(true)
    expect(res.transactions[1]!.hasPayslip).toBe(false)

    // Monthly rollup: 12 buckets, Jan + Feb populated.
    expect(res.monthly).toHaveLength(12)
    expect(res.monthly[0]!.depositCount).toBe(1)
    expect(res.monthly[0]!.withPayslipCount).toBe(1)
    expect(res.monthly[0]!.grossCents).toBe(120000)
    expect(res.monthly[1]!.depositCount).toBe(1)
    expect(res.monthly[1]!.withPayslipCount).toBe(0)
    expect(res.monthly[1]!.grossCents).toBe(105000) // falls back to total
    expect(res.monthly[2]!.depositCount).toBe(0)

    expect(res.completeness.missingNif).toBe(true)
    expect(res.completeness.monthsWithDeposits).toBe(2)
    expect(res.completeness.monthsMissingPayslip).toBe(1)
    expect(res.completeness.depositsMissingPayslip).toBe(1)
    expect(res.completeness.totalIrpfExtracted).toBe(true)
  })

  it("returns NOT_FOUND when source belongs to another user", async () => {
    vi.mocked(getIncomeSourceById).mockResolvedValue(null)
    await expect(caller().detail({ id: SOURCE_ID, year: 2025 })).rejects.toThrow(/not found/i)
  })
})

describe("incomeSources.linkTransaction / unlinkTransaction", () => {
  beforeEach(() => {
    vi.mocked(getIncomeSourceById).mockReset()
    vi.mocked(setTransactionIncomeSource).mockReset()
  })

  it("links a transaction to an owned income source", async () => {
    vi.mocked(getIncomeSourceById).mockResolvedValue(makeSource())
    vi.mocked(setTransactionIncomeSource).mockResolvedValue(true)

    const res = await caller().linkTransaction({ sourceId: SOURCE_ID, transactionId: TX_ID })

    expect(setTransactionIncomeSource).toHaveBeenCalledWith(USER_ID, TX_ID, SOURCE_ID)
    expect(res.ok).toBe(true)
  })

  it("refuses to link when the source isn't owned", async () => {
    vi.mocked(getIncomeSourceById).mockResolvedValue(null)
    await expect(
      caller().linkTransaction({ sourceId: SOURCE_ID, transactionId: TX_ID }),
    ).rejects.toThrow(/not found/i)
    expect(setTransactionIncomeSource).not.toHaveBeenCalled()
  })

  it("unlinks a transaction by nulling the FK", async () => {
    vi.mocked(setTransactionIncomeSource).mockResolvedValue(true)
    const res = await caller().unlinkTransaction({ transactionId: TX_ID })
    expect(setTransactionIncomeSource).toHaveBeenCalledWith(USER_ID, TX_ID, null)
    expect(res.ok).toBe(true)
  })
})

describe("incomeSources.suggestLinks", () => {
  beforeEach(() => {
    vi.mocked(getIncomeSourceById).mockReset()
    vi.mocked(listUnlinkedDepositsForSource).mockReset()
  })

  it("delegates to the model fn with id + name", async () => {
    vi.mocked(getIncomeSourceById).mockResolvedValue(makeSource())
    vi.mocked(listUnlinkedDepositsForSource).mockResolvedValue([
      {
        id: "tx-99",
        issuedAt: "2025-03-28T00:00:00.000Z",
        merchant: "Animus Systems SL",
        description: null,
        total: 105000,
        currencyCode: "EUR",
        status: "needs_review",
        matchReason: "merchant",
      },
    ])
    const res = await caller().suggestLinks({ id: SOURCE_ID, year: 2025 })
    expect(listUnlinkedDepositsForSource).toHaveBeenCalledWith(
      USER_ID,
      { id: SOURCE_ID, name: "Animus Systems SL" },
      2025,
    )
    expect(res).toHaveLength(1)
    expect(res[0]!.matchReason).toBe("merchant")
  })
})
