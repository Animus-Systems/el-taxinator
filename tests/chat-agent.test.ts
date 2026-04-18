import { describe, it, expect, vi, beforeEach } from "vitest"

// All mocks must be declared before imports
vi.mock("@/ai/providers/llmProvider", () => ({
  requestLLM: vi.fn(),
}))
vi.mock("@/models/chat", () => ({
  listChatMessages: vi.fn(async () => []),
  createChatMessage: vi.fn(async (userId, role, content, metadata, status) => ({
    id: `msg-${Math.random()}`,
    userId,
    role,
    content,
    metadata,
    status,
    appliedAt: null,
    createdAt: new Date(),
  })),
  upsertChatSummary: vi.fn(async () => ({
    id: "s", userId: "u", role: "system", content: "s", metadata: null,
    status: "sent", appliedAt: null, createdAt: new Date(),
  })),
  deleteOldestChatMessages: vi.fn(async () => 0),
  countActiveChatMessages: vi.fn(async () => 0),
  loadOldestChatMessages: vi.fn(async () => []),
  getChatSummary: vi.fn(async () => null),
}))
vi.mock("@/models/business-facts", () => ({
  listBusinessFacts: vi.fn(async () => []),
  upsertBusinessFact: vi.fn(async () => ({})),
}))
vi.mock("@/models/settings", () => ({
  getSettings: vi.fn(async () => ({})),
  getLLMSettings: vi.fn(() => ({ providers: [] })),
}))
vi.mock("@/models/categories", () => ({ getCategories: vi.fn(async () => []) }))
vi.mock("@/models/projects", () => ({ getProjects: vi.fn(async () => []) }))
vi.mock("@/models/rules", () => ({ getActiveRules: vi.fn(async () => []) }))
vi.mock("@/models/accounts", () => ({ getActiveAccounts: vi.fn(async () => []) }))
vi.mock("@/models/transactions", () => ({
  getTransactionById: vi.fn(async () => null),
  findSimilarByMerchant: vi.fn(async () => []),
}))
vi.mock("@/models/users", () => ({ getUserById: vi.fn(async () => ({ id: "u", entityType: "autonomo" })) }))
vi.mock("@/models/knowledge-packs", () => ({ listPacks: vi.fn(async () => []) }))
vi.mock("@/models/stats", async () => {
  const actual = await vi.importActual<typeof import("@/models/stats")>("@/models/stats")
  return {
    ...actual,
    getDashboardStats: vi.fn(async () => ({
      totalIncomePerCurrency: {},
      totalExpensesPerCurrency: {},
      profitPerCurrency: {},
      invoicesProcessed: 0,
    })),
  }
})

import { requestLLM } from "@/ai/providers/llmProvider"
import * as chatModel from "@/models/chat"
import * as factsModel from "@/models/business-facts"
import { processChatTurn, compactChatHistory } from "@/ai/chat-agent"

const USER_ID = "00000000-0000-0000-0000-000000000001"

describe("processChatTurn", () => {
  beforeEach(() => {
    vi.mocked(requestLLM).mockReset()
    vi.mocked(chatModel.createChatMessage).mockClear()
    vi.mocked(factsModel.upsertBusinessFact).mockClear()
  })

  it("persists user + assistant messages on a successful turn", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: { reply: "Got it.", proposedRule: null, proposedUpdate: null, extractedFacts: null },
      provider: "openai",
    })

    const { userMessage, assistantMessage } = await processChatTurn({
      userId: USER_ID,
      content: "hi",
    })

    expect(userMessage.role).toBe("user")
    expect(assistantMessage.role).toBe("assistant")
    expect(assistantMessage.content).toBe("Got it.")
    expect(assistantMessage.status).toBe("sent")
    expect(chatModel.createChatMessage).toHaveBeenCalledTimes(2)
  })

  it("prefers legacy proposedRule over proposedUpdate when both are returned", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        reply: "OK",
        proposedRule: {
          name: "R", matchType: "contains", matchField: "merchant",
          matchValue: "AWS", reason: "r",
        },
        proposedUpdate: {
          transactionId: "11111111-1111-1111-8111-111111111111",
          patch: { categoryCode: "software" },
          reason: "u",
        },
        extractedFacts: null,
      },
      provider: "openai",
    })

    const { assistantMessage } = await processChatTurn({
      userId: USER_ID,
      content: "hi",
    })

    expect(assistantMessage.metadata?.proposedAction?.kind).toBe("createRule")
    expect(assistantMessage.metadata?.proposedRule).toBeUndefined()
    expect(assistantMessage.metadata?.proposedUpdate).toBeUndefined()
  })

  it("persists an error message when requestLLM returns error", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {},
      provider: "openai",
      error: "rate limited",
    })

    const { assistantMessage } = await processChatTurn({
      userId: USER_ID,
      content: "hi",
    })

    expect(assistantMessage.status).toBe("error")
    expect(assistantMessage.metadata?.errorMessage).toBe("rate limited")
  })

  it("upserts extractedFacts to business_facts", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        reply: "noted",
        proposedRule: null,
        proposedUpdate: null,
        extractedFacts: [{ key: "category_for_aws", value: { text: "software" } }],
      },
      provider: "openai",
    })

    await processChatTurn({ userId: USER_ID, content: "hi" })

    expect(factsModel.upsertBusinessFact).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, key: "category_for_aws", source: "user" }),
    )
  })

  it("strips invalid proposed rule shapes", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        reply: "OK",
        proposedRule: { name: "bad", matchType: "nope", matchField: "merchant", matchValue: "x", reason: "r" },
        proposedUpdate: null,
        extractedFacts: null,
      },
      provider: "openai",
    })

    const { assistantMessage } = await processChatTurn({ userId: USER_ID, content: "hi" })
    expect(assistantMessage.metadata?.proposedRule).toBeUndefined()
  })

  it("writes proposedAction when LLM returns one", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        reply: "OK",
        proposedAction: {
          kind: "applyRuleToExisting",
          ruleSpec: {
            name: "AWS", matchType: "contains", matchField: "merchant",
            matchValue: "AWS", categoryCode: "software",
          },
          alsoCreate: true,
          reason: "backfill",
        },
      },
      provider: "openai",
    })

    const { assistantMessage } = await processChatTurn({
      userId: USER_ID,
      content: "apply this rule to past",
    })

    expect(assistantMessage.metadata?.proposedAction?.kind).toBe("applyRuleToExisting")
  })

  it("auto-migrates legacy proposedRule output to proposedAction", async () => {
    vi.mocked(requestLLM).mockResolvedValue({
      output: {
        reply: "OK",
        proposedRule: {
          name: "r", matchType: "contains", matchField: "merchant",
          matchValue: "AWS", reason: "r",
        },
      },
      provider: "openai",
    })

    const { assistantMessage } = await processChatTurn({ userId: USER_ID, content: "hi" })
    const action = assistantMessage.metadata?.proposedAction
    expect(action?.kind).toBe("createRule")
  })

  it("includes a Recent activity block in the prompt when stats are present", async () => {
    vi.mocked(requestLLM).mockReset()
    vi.mocked(requestLLM).mockResolvedValue({
      output: { reply: "hi" },
      provider: "openai",
    })

    const stats = await import("@/models/stats")
    vi.spyOn(stats, "getDashboardStats").mockResolvedValue({
      totalIncomePerCurrency: { EUR: 100000 },
      totalExpensesPerCurrency: { EUR: 40000 },
      profitPerCurrency: { EUR: 60000 },
      invoicesProcessed: 5,
    })

    await processChatTurn({ userId: USER_ID, content: "hi" })

    const call = vi.mocked(requestLLM).mock.calls[0]
    const prompt = String((call?.[1] as { prompt: string }).prompt)
    expect(prompt).toMatch(/\[Recent activity\]/)
    expect(prompt).toMatch(/YTD/i)
  })
})

describe("compactChatHistory", () => {
  beforeEach(() => {
    vi.mocked(chatModel.countActiveChatMessages).mockReset()
    vi.mocked(chatModel.loadOldestChatMessages).mockReset()
    vi.mocked(chatModel.upsertChatSummary).mockReset()
    vi.mocked(chatModel.deleteOldestChatMessages).mockReset()
    vi.mocked(chatModel.getChatSummary).mockReset()
    vi.mocked(requestLLM).mockReset()
  })

  it("no-ops when count <= 100", async () => {
    vi.mocked(chatModel.countActiveChatMessages).mockResolvedValue(50)
    await compactChatHistory(USER_ID)
    expect(chatModel.loadOldestChatMessages).not.toHaveBeenCalled()
    expect(requestLLM).not.toHaveBeenCalled()
  })

  it("summarizes overflow and deletes the oldest messages", async () => {
    vi.mocked(chatModel.countActiveChatMessages).mockResolvedValue(105)
    vi.mocked(chatModel.getChatSummary).mockResolvedValue(null)
    vi.mocked(chatModel.loadOldestChatMessages).mockResolvedValue(
      Array.from({ length: 5 }).map((_, i) => ({
        id: `m${i}`, userId: USER_ID, role: "user" as const, content: `msg ${i}`,
        metadata: null, status: "sent" as const, appliedAt: null, createdAt: new Date(),
      })),
    )
    vi.mocked(requestLLM).mockResolvedValue({
      output: { summary: "summary text" },
      provider: "openai",
    })

    await compactChatHistory(USER_ID)

    expect(chatModel.upsertChatSummary).toHaveBeenCalledWith(USER_ID, "summary text", 5)
    expect(chatModel.deleteOldestChatMessages).toHaveBeenCalledWith(USER_ID, 5)
  })

  it("does not delete rows when summarization fails", async () => {
    vi.mocked(chatModel.countActiveChatMessages).mockResolvedValue(105)
    vi.mocked(chatModel.getChatSummary).mockResolvedValue(null)
    vi.mocked(chatModel.loadOldestChatMessages).mockResolvedValue([
      { id: "m0", userId: USER_ID, role: "user" as const, content: "hi",
        metadata: null, status: "sent" as const, appliedAt: null, createdAt: new Date() },
    ])
    vi.mocked(requestLLM).mockResolvedValue({
      output: {},
      provider: "openai",
      error: "llm down",
    })

    await compactChatHistory(USER_ID)

    expect(chatModel.upsertChatSummary).not.toHaveBeenCalled()
    expect(chatModel.deleteOldestChatMessages).not.toHaveBeenCalled()
  })
})
