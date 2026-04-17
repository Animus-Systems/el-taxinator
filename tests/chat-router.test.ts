import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/ai/chat-agent", () => ({
  processChatTurn: vi.fn(),
  compactChatHistory: vi.fn(),
}))
vi.mock("@/models/chat", () => ({
  listChatMessages: vi.fn(),
  clearChatMessages: vi.fn(),
  markMessageApplied: vi.fn(),
}))
vi.mock("@/models/rules", () => ({
  createRule: vi.fn(),
  getActiveRules: vi.fn(async () => []),
  deleteRule: vi.fn(),
  applyRuleToExistingTransactions: vi.fn(),
}))
vi.mock("@/models/transactions", () => ({
  getTransactionById: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkUpdateTransactions: vi.fn(),
}))
vi.mock("@/models/categories", () => ({
  createCategory: vi.fn(async () => ({ code: "software" })),
}))
vi.mock("@/models/projects", () => ({
  createProject: vi.fn(async () => ({ code: "proj-a" })),
}))
vi.mock("@/lib/entities", () => ({
  getActiveEntityId: vi.fn(async () => "entity-1"),
}))

import { chatRouter } from "@/lib/trpc/routers/chat"
import * as agent from "@/ai/chat-agent"
import * as chatModel from "@/models/chat"
import * as rulesModel from "@/models/rules"
import * as txModel from "@/models/transactions"
import { applyRuleToExistingTransactions, deleteRule } from "@/models/rules"
import { bulkUpdateTransactions, deleteTransaction } from "@/models/transactions"
import { createCategory as createCategoryModel } from "@/models/categories"
import { createProject as createProjectModel } from "@/models/projects"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const ctx = { user: { id: USER_ID } }

function caller() {
  return chatRouter.createCaller(ctx as unknown as Parameters<typeof chatRouter.createCaller>[0])
}

describe("chat router", () => {
  beforeEach(() => {
    vi.mocked(agent.processChatTurn).mockReset()
    vi.mocked(chatModel.listChatMessages).mockReset()
    vi.mocked(chatModel.clearChatMessages).mockReset()
    vi.mocked(chatModel.markMessageApplied).mockReset()
    vi.mocked(rulesModel.createRule).mockReset()
    vi.mocked(txModel.getTransactionById).mockReset()
    vi.mocked(txModel.updateTransaction).mockReset()
  })

  it("list returns messages scoped by user", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([])
    const res = await caller().list()
    expect(chatModel.listChatMessages).toHaveBeenCalledWith(USER_ID)
    expect(res).toEqual([])
  })

  it("send delegates to processChatTurn", async () => {
    vi.mocked(agent.processChatTurn).mockResolvedValue({
      userMessage: { id: "u1", userId: USER_ID, role: "user", content: "hi", metadata: null, status: "sent", appliedAt: null, createdAt: new Date() },
      assistantMessage: { id: "a1", userId: USER_ID, role: "assistant", content: "hey", metadata: null, status: "sent", appliedAt: null, createdAt: new Date() },
    })
    const res = await caller().send({ content: "hi" })
    expect(agent.processChatTurn).toHaveBeenCalledWith({ userId: USER_ID, content: "hi" })
    expect(res.assistantMessage.content).toBe("hey")
  })

  it("applyProposedRule rejects when message has no rule", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([
      { id: "m1", userId: USER_ID, role: "assistant", content: "x", metadata: null, status: "sent", appliedAt: null, createdAt: new Date() },
    ])
    await expect(caller().applyProposedRule({ messageId: "m1" })).rejects.toThrow()
  })

  it("applyProposedUpdate rejects when transaction is owned by a different user", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([
      {
        id: "m2", userId: USER_ID, role: "assistant", content: "x",
        metadata: { proposedUpdate: { transactionId: "11111111-1111-1111-8111-111111111111", patch: { categoryCode: "software" }, reason: "r" } },
        status: "sent", appliedAt: null, createdAt: new Date(),
      },
    ])
    vi.mocked(txModel.getTransactionById).mockResolvedValue(null) // not found for this user
    await expect(caller().applyProposedUpdate({ messageId: "m2" })).rejects.toThrow()
  })

  it("clear deletes all messages", async () => {
    vi.mocked(chatModel.clearChatMessages).mockResolvedValue(3)
    const res = await caller().clear()
    expect(res.deleted).toBe(3)
    expect(chatModel.clearChatMessages).toHaveBeenCalledWith(USER_ID)
  })
})

describe("chat router — preview + applyProposedAction", () => {
  beforeEach(() => {
    vi.mocked(applyRuleToExistingTransactions).mockReset()
    vi.mocked(bulkUpdateTransactions).mockReset()
    vi.mocked(createCategoryModel).mockReset()
    vi.mocked(createProjectModel).mockReset()
    vi.mocked(deleteTransaction).mockReset()
    vi.mocked(deleteRule).mockReset()
    vi.mocked(chatModel.listChatMessages).mockReset()
    vi.mocked(chatModel.markMessageApplied).mockReset()
  })

  it("previewRuleApplication returns matchCount + sampleIds", async () => {
    vi.mocked(applyRuleToExistingTransactions).mockResolvedValue({
      matchCount: 3, sampleIds: ["a", "b", "c"], updated: 0,
    })
    const res = await caller().previewRuleApplication({
      ruleSpec: {
        name: "r", matchType: "contains", matchField: "merchant",
        matchValue: "AWS", categoryCode: "software",
      },
    })
    expect(res.matchCount).toBe(3)
    expect(applyRuleToExistingTransactions).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ matchValue: "AWS" }),
      { dryRun: true },
    )
  })

  it("previewBulkUpdate returns matchCount", async () => {
    vi.mocked(bulkUpdateTransactions).mockResolvedValue({
      matchCount: 5, sampleIds: ["a"], updated: 0,
    })
    const res = await caller().previewBulkUpdate({
      filter: { merchant: "AWS" },
    })
    expect(res.matchCount).toBe(5)
  })

  it("applyProposedAction createCategory dispatches to createCategory model", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([
      {
        id: "m1", userId: USER_ID, role: "assistant", content: "x",
        metadata: {
          proposedAction: { kind: "createCategory", name: "Software", reason: "r" },
        },
        status: "sent", appliedAt: null, createdAt: new Date(),
      },
    ])
    vi.mocked(chatModel.markMessageApplied).mockResolvedValue({
      id: "m1", userId: USER_ID, role: "assistant", content: "x",
      metadata: null, status: "sent", appliedAt: new Date(), createdAt: new Date(),
    })
    await caller().applyProposedAction({ messageId: "m1" })
    expect(createCategoryModel).toHaveBeenCalled()
    expect(chatModel.markMessageApplied).toHaveBeenCalledWith(USER_ID, "m1")
  })

  it("applyProposedAction bulkUpdate dispatches with filter+patch", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([
      {
        id: "m2", userId: USER_ID, role: "assistant", content: "x",
        metadata: {
          proposedAction: {
            kind: "bulkUpdate",
            filter: { merchant: "AWS" },
            patch: { categoryCode: "software" },
            reason: "r",
          },
        },
        status: "sent", appliedAt: null, createdAt: new Date(),
      },
    ])
    vi.mocked(bulkUpdateTransactions).mockResolvedValue({ matchCount: 3, sampleIds: [], updated: 3 })
    vi.mocked(chatModel.markMessageApplied).mockResolvedValue({
      id: "m2", userId: USER_ID, role: "assistant", content: "x",
      metadata: null, status: "sent", appliedAt: new Date(), createdAt: new Date(),
    })
    const res = await caller().applyProposedAction({ messageId: "m2" })
    expect(bulkUpdateTransactions).toHaveBeenCalledWith(USER_ID, { merchant: "AWS" }, { categoryCode: "software" }, {})
    expect((res.result as { updated?: number }).updated).toBe(3)
  })

  it("applyProposedAction rejects when no proposedAction is present", async () => {
    vi.mocked(chatModel.listChatMessages).mockResolvedValue([
      {
        id: "m3", userId: USER_ID, role: "assistant", content: "x", metadata: null,
        status: "sent", appliedAt: null, createdAt: new Date(),
      },
    ])
    await expect(caller().applyProposedAction({ messageId: "m3" })).rejects.toThrow()
  })
})
