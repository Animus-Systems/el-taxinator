import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pg", () => {
  const state = { rows: [] as Record<string, unknown>[], queries: [] as { text: string; values: unknown[] }[] }
  return {
    __state: state,
    getPool: async () => ({
      query: async (text: string, values: unknown[]) => {
        state.queries.push({ text, values })
        const next = state.rows
        state.rows = []
        return { rows: next, rowCount: next.length }
      },
    }),
  }
})

import * as pg from "@/lib/pg"
import {
  listChatMessages,
  createChatMessage,
  markMessageApplied,
  clearChatMessages,
  upsertChatSummary,
  deleteOldestChatMessages,
  countActiveChatMessages,
  loadOldestChatMessages,
  getChatSummary,
} from "@/models/chat"

function seedRows(rows: Record<string, unknown>[]) {
  ;(pg as unknown as { __state: { rows: Record<string, unknown>[]; queries: unknown[] } }).__state.rows = rows
}
function lastQuery(): { text: string; values: unknown[] } {
  const state = (pg as unknown as { __state: { queries: { text: string; values: unknown[] }[] } }).__state
  return state.queries[state.queries.length - 1]!
}

const USER_ID = "00000000-0000-0000-0000-000000000001"

describe("models/chat", () => {
  beforeEach(() => {
    ;(pg as unknown as { __state: { rows: Record<string, unknown>[]; queries: unknown[] } }).__state.queries = []
  })

  it("listChatMessages orders by created_at ASC and scopes by user", async () => {
    seedRows([])
    await listChatMessages(USER_ID)
    expect(lastQuery().text).toMatch(/FROM chat_messages/)
    expect(lastQuery().text).toMatch(/ORDER BY created_at ASC/)
    expect(lastQuery().values).toContain(USER_ID)
  })

  it("createChatMessage inserts user role with metadata as jsonb", async () => {
    seedRows([
      { id: "m1", user_id: USER_ID, role: "user", content: "hi", metadata: null, status: "sent", applied_at: null, created_at: new Date() },
    ])
    const msg = await createChatMessage(USER_ID, "user", "hi", null, "sent")
    expect(msg.id).toBe("m1")
    expect(lastQuery().text).toMatch(/INSERT INTO chat_messages/)
  })

  it("markMessageApplied stamps applied_at and scopes by user", async () => {
    seedRows([{ id: "m1", user_id: USER_ID, role: "assistant", content: "x", metadata: null, status: "sent", applied_at: new Date(), created_at: new Date() }])
    const m = await markMessageApplied(USER_ID, "m1")
    expect(m?.appliedAt).toBeInstanceOf(Date)
    expect(lastQuery().text).toMatch(/UPDATE chat_messages SET applied_at = now\(\)/)
    expect(lastQuery().text).toMatch(/AND user_id =/)
  })

  it("clearChatMessages deletes scoped by user", async () => {
    seedRows([])
    await clearChatMessages(USER_ID)
    expect(lastQuery().text).toMatch(/DELETE FROM chat_messages/)
    expect(lastQuery().text).toMatch(/WHERE user_id =/)
  })

  it("upsertChatSummary upserts the single system row", async () => {
    seedRows([{ id: "s1", user_id: USER_ID, role: "system", content: "sum", metadata: { summaryOfCount: 150 }, status: "sent", applied_at: null, created_at: new Date() }])
    const row = await upsertChatSummary(USER_ID, "sum", 150)
    expect(row.role).toBe("system")
    expect(lastQuery().text).toMatch(/INSERT INTO chat_messages/)
    expect(lastQuery().text).toMatch(/ON CONFLICT/)
  })

  it("deleteOldestChatMessages deletes exactly `limit` oldest non-summary rows", async () => {
    seedRows([])
    await deleteOldestChatMessages(USER_ID, 5)
    expect(lastQuery().text).toMatch(/DELETE FROM chat_messages/)
    expect(lastQuery().text).toMatch(/role IN \('user', 'assistant'\)/)
    expect(lastQuery().text).toMatch(/LIMIT /)
  })

  it("countActiveChatMessages counts user+assistant rows only", async () => {
    seedRows([{ count: 42 }])
    const n = await countActiveChatMessages(USER_ID)
    expect(n).toBe(42)
    expect(lastQuery().text).toMatch(/SELECT COUNT/)
    expect(lastQuery().text).toMatch(/role IN \('user', 'assistant'\)/)
  })

  it("getChatSummary returns null when no summary row", async () => {
    seedRows([])
    const s = await getChatSummary(USER_ID)
    expect(s).toBeNull()
  })

  it("loadOldestChatMessages selects the N oldest user/assistant rows", async () => {
    seedRows([])
    await loadOldestChatMessages(USER_ID, 3)
    expect(lastQuery().text).toMatch(/FROM chat_messages/)
    expect(lastQuery().text).toMatch(/role IN \('user', 'assistant'\)/)
    expect(lastQuery().text).toMatch(/ORDER BY created_at ASC/)
    expect(lastQuery().text).toMatch(/LIMIT /)
  })
})
