import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const buildInsert = vi.fn((table: string, data: Record<string, unknown>) => ({
    table,
    data,
  }))

  return {
    buildInsert,
    queryOne: vi.fn(async (query: { data?: Record<string, unknown> }) => query.data ?? null),
    getOrCreateSelfHostedUser: vi.fn(),
    getImportSessionById: vi.fn(),
    updateImportSession: vi.fn(),
    getFields: vi.fn(),
    createCategory: vi.fn(),
    getSettings: vi.fn(),
    getActiveRules: vi.fn(),
    applyRulesToCandidates: vi.fn(),
    detectCSVMapping: vi.fn(),
    applyCSVMapping: vi.fn(),
    categorizeTransactions: vi.fn(),
    categorizeTransactionsWithFeedback: vi.fn(),
    suggestNewCategories: vi.fn(),
    detectPDFType: vi.fn(),
    extractPDFTransactions: vi.fn(),
    getPool: vi.fn(),
    deleteFile: vi.fn(),
  }
})

vi.mock("@/lib/sql", () => ({
  sql: vi.fn(),
  queryMany: vi.fn(),
  queryOne: mocks.queryOne,
  buildInsert: mocks.buildInsert,
  buildUpdate: vi.fn(),
  execute: vi.fn(),
  mapRow: vi.fn((row: unknown) => row),
  camelToSnake: vi.fn((value: string) => value),
  mapCategoryFromRow: vi.fn(() => null),
  mapProjectFromRow: vi.fn(() => null),
}))

vi.mock("@/models/users", () => ({
  getOrCreateSelfHostedUser: mocks.getOrCreateSelfHostedUser,
}))

vi.mock("@/models/import-sessions", () => ({
  createImportSession: vi.fn(),
  getImportSessionById: mocks.getImportSessionById,
  updateImportSession: mocks.updateImportSession,
  deleteImportSession: vi.fn(),
}))

vi.mock("@/models/categories", () => ({
  createCategory: mocks.createCategory,
}))

vi.mock("@/models/settings", () => ({
  getSettings: mocks.getSettings,
}))

vi.mock("@/models/rules", () => ({
  getActiveRules: mocks.getActiveRules,
  applyRulesToCandidates: mocks.applyRulesToCandidates,
}))

vi.mock("@/ai/import-csv", () => ({
  detectCSVMapping: mocks.detectCSVMapping,
  applyCSVMapping: mocks.applyCSVMapping,
  categorizeTransactions: mocks.categorizeTransactions,
  categorizeTransactionsWithFeedback: mocks.categorizeTransactionsWithFeedback,
}))

vi.mock("@/ai/suggest-categories", () => ({
  suggestNewCategories: mocks.suggestNewCategories,
}))

vi.mock("@/ai/import-pdf", () => ({
  detectPDFType: mocks.detectPDFType,
  extractPDFTransactions: mocks.extractPDFTransactions,
}))

vi.mock("@/models/fields", () => ({
  getFields: mocks.getFields,
}))

vi.mock("@/lib/pg", () => ({
  getPool: mocks.getPool,
}))

vi.mock("@/models/files", () => ({
  deleteFile: mocks.deleteFile,
}))

import { importRoutes } from "@/server/routes/import"

describe("import commit route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getOrCreateSelfHostedUser.mockResolvedValue({
      id: "user-1",
      email: "taxhacker@localhost",
    })
    mocks.getFields.mockResolvedValue([
      {
        id: "field-name",
        userId: "user-1",
        code: "name",
        name: { en: "Name", es: "Nombre" },
        type: "string",
        llmPrompt: null,
        options: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        isVisibleInList: true,
        isVisibleInAnalysis: true,
        isRequired: false,
        isExtra: false,
      },
    ])
    mocks.getImportSessionById.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      accountId: "acc-123",
      fileName: "statement.csv",
      fileType: "csv",
      rowCount: 1,
      data: [
        {
          rowIndex: 0,
          name: "Spotify",
          merchant: "Spotify",
          description: "Subscription",
          total: 1599,
          currencyCode: "EUR",
          type: "expense",
          issuedAt: "2026-04-01",
          categoryCode: "software",
          projectCode: null,
          status: "business",
          selected: true,
          suggestedStatus: "business",
          confidence: {
            category: 1,
            type: 1,
            status: 1,
            overall: 1,
          },
        },
      ],
      columnMapping: null,
      status: "pending",
      suggestedCategories: [],
      createdAt: new Date("2026-04-14T00:00:00.000Z"),
    })
    mocks.updateImportSession.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("persists the import session accountId into created transactions on commit", async () => {
    const app = Fastify()
    await app.register(importRoutes)

    const response = await app.inject({
      method: "POST",
      url: "/api/import/session/session-1/commit",
      payload: {
        selectedRowIndexes: [0],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ success: true, created: 1 })
    expect(mocks.buildInsert).toHaveBeenCalledWith(
      "transactions",
      expect.objectContaining({
        userId: "user-1",
        name: "Spotify",
        accountId: "acc-123",
      }),
    )

    await app.close()
  })

  it("rejects commit when a selected reviewed candidate is still needs_review", async () => {
    const app = Fastify()
    await app.register(importRoutes)

    const response = await app.inject({
      method: "POST",
      url: "/api/import/session/session-1/commit",
      payload: {
        reviewedCandidates: [
          {
            rowIndex: 0,
            selected: true,
            status: "needs_review",
            categoryCode: null,
          },
        ],
        selectedRowIndexes: [0],
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      success: false,
      error: "Review incomplete",
      validationErrors: [
        expect.objectContaining({
          rowIndex: 0,
          code: "needs_review",
        }),
      ],
    })
    expect(mocks.buildInsert).not.toHaveBeenCalled()

    await app.close()
  })

  it("commits reviewed candidates rather than stale session rows", async () => {
    const app = Fastify()
    await app.register(importRoutes)

    const response = await app.inject({
      method: "POST",
      url: "/api/import/session/session-1/commit",
      payload: {
        reviewedCandidates: [
          {
            rowIndex: 0,
            selected: true,
            name: "Reviewed Spotify",
            merchant: "Spotify",
            description: "Reviewed Subscription",
            total: 1599,
            currencyCode: "EUR",
            type: "expense",
            categoryCode: "software",
            projectCode: null,
            issuedAt: "2026-04-01",
            status: "business",
          },
        ],
        selectedRowIndexes: [0],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ success: true, created: 1 })
    expect(mocks.buildInsert).toHaveBeenCalledWith(
      "transactions",
      expect.objectContaining({
        userId: "user-1",
        name: "Reviewed Spotify",
        description: "Reviewed Subscription",
        categoryCode: "software",
        status: "business",
      }),
    )
    expect(mocks.updateImportSession).toHaveBeenCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        data: [
          expect.objectContaining({
            name: "Reviewed Spotify",
            status: "business",
          }),
        ],
      }),
    )

    await app.close()
  })
})
