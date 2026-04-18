import { describe, it, expect, vi, beforeEach } from "vitest"

// Mocks must be declared before imports.
vi.mock("@/ai/providers/llmProvider", () => ({
  requestLLM: vi.fn(),
}))
vi.mock("@/models/settings", () => ({
  getSettings: vi.fn(async () => ({ language: "en" })),
  getLLMSettings: vi.fn(() => ({ providers: [{ provider: "openai", apiKey: "k", model: "gpt-4o-mini" }] })),
}))
vi.mock("@/models/categories", () => ({ getCategories: vi.fn(async () => []) }))
vi.mock("@/models/projects", () => ({ getProjects: vi.fn(async () => []) }))
vi.mock("@/models/accounts", () => ({ getActiveAccounts: vi.fn(async () => []) }))
vi.mock("@/models/rules", () => ({ getActiveRules: vi.fn(async () => []) }))
vi.mock("@/models/knowledge-packs", () => ({ listPacks: vi.fn(async () => []) }))
vi.mock("@/models/business-facts", () => ({
  listBusinessFacts: vi.fn(async () => []),
  hasAnyBusinessFacts: vi.fn(async () => true),
  upsertBusinessFact: vi.fn(async () => ({})),
}))
vi.mock("@/models/users", () => ({
  getUserById: vi.fn(async () => ({
    id: "u1",
    entityType: "autonomo",
    businessName: "Test Biz",
  })),
}))
vi.mock("@/models/ai-analysis-results", () => ({
  recordAnalysis: vi.fn(async () => undefined),
}))
vi.mock("@/models/import-sessions", () => ({
  getImportSessionById: vi.fn(),
  updateImportSession: vi.fn(async () => undefined),
  setBusinessContextSnapshot: vi.fn(async () => undefined),
}))
vi.mock("@/lib/context-file-text", () => ({
  loadContextFileText: vi.fn(),
}))

import { requestLLM } from "@/ai/providers/llmProvider"
import { getImportSessionById } from "@/models/import-sessions"
import { loadContextFileText } from "@/lib/context-file-text"
import { processWizardTurn } from "@/ai/wizard"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SESSION_ID = "00000000-0000-0000-0000-000000000002"
const FILE_ID = "00000000-0000-0000-0000-000000000099"

describe("processWizardTurn — context files", () => {
  beforeEach(() => {
    vi.mocked(requestLLM).mockReset()
    vi.mocked(getImportSessionById).mockReset()
    vi.mocked(loadContextFileText).mockReset()
  })

  it("injects attached context file text into the LLM prompt", async () => {
    vi.mocked(getImportSessionById).mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      accountId: null,
      fileName: null,
      fileType: null,
      rowCount: 0,
      data: [],
      columnMapping: null,
      status: "pending",
      suggestedCategories: [],
      entryMode: "csv",
      messages: [],
      businessContextSnapshot: null,
      promptVersion: null,
      title: null,
      lastActivityAt: new Date(),
      pendingTurnAt: null,
      fileId: null,
      contextFileIds: [FILE_ID],
      createdAt: new Date(),
    } as never)

    vi.mocked(loadContextFileText).mockResolvedValue({
      fileId: FILE_ID,
      fileName: "swissborg-statement.pdf",
      fileType: "application/pdf",
      text: "MARKER_CONTEXT_TEXT_42",
      truncated: false,
    })

    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        assistantMessage: "OK",
        candidateUpdates: [],
        bulkActions: [],
        clarifyingQuestions: [],
        taxTips: [],
        businessFactsToSave: [],
        proposedTransferLinks: [],
      },
      provider: "openai",
    })

    await processWizardTurn({
      userId: USER_ID,
      sessionId: SESSION_ID,
      userMessage: "what's in the pdf?",
    })

    expect(loadContextFileText).toHaveBeenCalledWith(FILE_ID, USER_ID)
    expect(requestLLM).toHaveBeenCalledTimes(1)
    const call = vi.mocked(requestLLM).mock.calls[0]
    expect(call).toBeDefined()
    const prompt = (call![1] as { prompt: string }).prompt
    expect(prompt).toContain("## Supplementary context from attached files")
    expect(prompt).toContain("swissborg-statement.pdf")
    expect(prompt).toContain("MARKER_CONTEXT_TEXT_42")
  })

  it("omits the context block when the session has no context files", async () => {
    vi.mocked(getImportSessionById).mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      accountId: null,
      fileName: null,
      fileType: null,
      rowCount: 0,
      data: [],
      columnMapping: null,
      status: "pending",
      suggestedCategories: [],
      entryMode: "csv",
      messages: [],
      businessContextSnapshot: null,
      promptVersion: null,
      title: null,
      lastActivityAt: new Date(),
      pendingTurnAt: null,
      fileId: null,
      contextFileIds: [],
      createdAt: new Date(),
    } as never)

    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        assistantMessage: "OK",
        candidateUpdates: [],
        bulkActions: [],
        clarifyingQuestions: [],
        taxTips: [],
        businessFactsToSave: [],
        proposedTransferLinks: [],
      },
      provider: "openai",
    })

    await processWizardTurn({
      userId: USER_ID,
      sessionId: SESSION_ID,
      userMessage: "hi",
    })

    expect(loadContextFileText).not.toHaveBeenCalled()
    const call = vi.mocked(requestLLM).mock.calls[0]
    expect(call).toBeDefined()
    const prompt = (call![1] as { prompt: string }).prompt
    expect(prompt).not.toContain("## Supplementary context from attached files")
  })
})
