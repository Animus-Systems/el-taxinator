import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/models/import-sessions", () => ({
  getImportSessionById: vi.fn(),
  updateImportSession: vi.fn(async () => undefined),
  createImportSession: vi.fn(),
  deleteImportSession: vi.fn(),
  appendMessage: vi.fn(),
  beginTurn: vi.fn(),
  endTurn: vi.fn(),
  stealLock: vi.fn(),
  abandonSession: vi.fn(),
  reopenSession: vi.fn(),
  listResumableSessions: vi.fn(async () => []),
  listArchivedSessions: vi.fn(async () => []),
  listCommittedSessions: vi.fn(async () => []),
}))
vi.mock("@/models/income-sources", () => ({
  upsertIncomeSource: vi.fn(),
  listIncomeSources: vi.fn(async () => []),
}))
vi.mock("@/models/business-facts", () => ({
  listBusinessFacts: vi.fn(async () => []),
  upsertBusinessFact: vi.fn(),
  deleteBusinessFact: vi.fn(),
  hasAnyBusinessFacts: vi.fn(async () => true),
}))
vi.mock("@/models/files", () => ({ getFilesByIds: vi.fn(async () => []) }))
vi.mock("@/models/users", () => ({ getUserById: vi.fn() }))
vi.mock("@/ai/wizard", () => ({
  processWizardTurn: vi.fn(),
  runOnboardingTurn: vi.fn(),
  makeUserMessage: vi.fn(),
  makeAssistantMessage: vi.fn(),
  makeFailureMessage: vi.fn(),
}))
vi.mock("@/ai/session-report", () => ({ buildSessionReport: vi.fn() }))

import { wizardRouter } from "@/lib/trpc/routers/wizard"
import { getImportSessionById, updateImportSession } from "@/models/import-sessions"
import { upsertIncomeSource } from "@/models/income-sources"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SESSION_ID = "00000000-0000-0000-0000-000000000002"
const SOURCE_ID = "00000000-0000-0000-0000-00000000ffff"
const ctx = { user: { id: USER_ID } }

function caller() {
  return wizardRouter.createCaller(
    ctx as unknown as Parameters<typeof wizardRouter.createCaller>[0],
  )
}

function makeCandidate(rowIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    rowIndex,
    name: "Transfer received",
    merchant: "Animus Systems SL",
    description: "Nómina Animus Systems SL",
    total: 105000,
    currencyCode: "EUR",
    type: "income",
    categoryCode: null,
    projectCode: null,
    accountId: null,
    issuedAt: "2025-09-30",
    status: "needs_review",
    suggestedStatus: null,
    confidence: { category: 0, type: 0, status: 0, overall: 0 },
    selected: true,
    ...overrides,
  }
}

describe("wizard.applyBulkAction — createIncomeSource branch", () => {
  beforeEach(() => {
    vi.mocked(getImportSessionById).mockReset()
    vi.mocked(updateImportSession).mockReset()
    vi.mocked(upsertIncomeSource).mockReset()
  })

  it("upserts the income source and stamps its id on every matched candidate", async () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)]
    vi.mocked(getImportSessionById).mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      data: candidates,
    } as unknown as Awaited<ReturnType<typeof getImportSessionById>>)
    vi.mocked(upsertIncomeSource).mockResolvedValue({
      id: SOURCE_ID,
      userId: USER_ID,
      kind: "salary",
      name: "Animus Systems SL",
      taxId: "B12345678",
      metadata: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await caller().applyBulkAction({
      sessionId: SESSION_ID,
      action: {
        description: "Link Animus deposits to an employment source",
        match: { field: "merchant", type: "contains", value: "Animus" },
        apply: {
          status: "personal_taxable",
          type: "income",
          createIncomeSource: { kind: "salary", name: "Animus Systems SL", taxId: "B12345678" },
        },
        affectedRowIndexes: [0, 1, 2],
        offerAsRule: false,
      },
    })

    expect(upsertIncomeSource).toHaveBeenCalledWith(USER_ID, {
      kind: "salary",
      name: "Animus Systems SL",
      taxId: "B12345678",
    })
    expect(res.updated).toBe(3)
    expect(res.createdIncomeSourceId).toBe(SOURCE_ID)

    const persistedCall = vi.mocked(updateImportSession).mock.calls[0]
    expect(persistedCall).toBeDefined()
    const persistedCandidates = (persistedCall![2] as { data: unknown[] }).data as Array<{ incomeSourceId?: string }>
    expect(persistedCandidates.every((c) => c.incomeSourceId === SOURCE_ID)).toBe(true)
  })

  it("leaves incomeSourceId alone when createIncomeSource is not set", async () => {
    const candidates = [makeCandidate(0), makeCandidate(1)]
    vi.mocked(getImportSessionById).mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      data: candidates,
    } as unknown as Awaited<ReturnType<typeof getImportSessionById>>)

    const res = await caller().applyBulkAction({
      sessionId: SESSION_ID,
      action: {
        description: "Mark as personal ignored",
        match: { field: "description", type: "contains", value: "nómina" },
        apply: { status: "personal_ignored" },
        affectedRowIndexes: [0, 1],
        offerAsRule: false,
      },
    })

    expect(upsertIncomeSource).not.toHaveBeenCalled()
    expect(res.createdIncomeSourceId).toBeNull()

    const persistedCall = vi.mocked(updateImportSession).mock.calls[0]
    const persistedCandidates = (persistedCall![2] as { data: unknown[] }).data as Array<{ incomeSourceId?: string }>
    expect(persistedCandidates.every((c) => c.incomeSourceId === undefined)).toBe(true)
  })
})
