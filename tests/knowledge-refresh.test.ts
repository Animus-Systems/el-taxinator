import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Capture requestLLM calls so we can swap the response per test.
const requestLLMMock = vi.fn()

vi.mock("@/ai/providers/llmProvider", () => ({
  requestLLM: (...args: unknown[]) => requestLLMMock(...args),
}))

const getPackMock = vi.fn()
const upsertPackMock = vi.fn()
vi.mock("@/models/knowledge-packs", () => ({
  getPack: (...args: unknown[]) => getPackMock(...args),
  upsertPack: (...args: unknown[]) => upsertPackMock(...args),
  insertPackIfMissing: vi.fn(),
}))

vi.mock("@/models/settings", () => ({
  getSettings: vi.fn(async () => ({})),
  getLLMSettings: () => ({
    providers: [{ provider: "openai", model: "gpt-4.1", apiKey: "sk-test" }],
  }),
}))

import { refreshPack, RefreshError } from "@/ai/knowledge-refresh"

const LONG_CONTENT = Array.from({ length: 50 }, (_, i) => `## Section ${i}\nparagraph line here.`).join("\n\n")

const basePack = {
  id: "pack-1",
  userId: "u-1",
  slug: "canary-autonomo",
  title: "Canary Islands — Autónomo tax knowledge",
  content: LONG_CONTENT,
  sourcePrompt: null,
  lastRefreshedAt: null,
  refreshIntervalDays: 30,
  provider: null,
  model: null,
  reviewStatus: "seed",
  pendingReviewContent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("refreshPack", () => {
  beforeEach(() => {
    requestLLMMock.mockReset()
    getPackMock.mockReset()
    upsertPackMock.mockReset()
    getPackMock.mockResolvedValue({ ...basePack })
    upsertPackMock.mockImplementation(async (input: { content: string }) => ({
      ...basePack,
      content: input.content,
      lastRefreshedAt: new Date(),
      reviewStatus: "needs_review",
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns 'updated' when provider honours the envelope and content changed", async () => {
    const newContent = LONG_CONTENT + "\n\n## New section\nmore material."
    requestLLMMock.mockResolvedValue({
      output: {
        content: newContent,
        summary: "Verified 2026 rates",
        citations: ["LIRPF art. 63"],
      },
      provider: "openai",
    })

    const result = await refreshPack("u-1", "canary-autonomo")
    expect(result.kind).toBe("updated")
    if (result.kind !== "updated") return
    expect(result.pack.content).toContain("## New section")
    expect(result.summary).toBe("Verified 2026 rates")
    expect(result.citations).toContain("LIRPF art. 63")
    expect(upsertPackMock).toHaveBeenCalled()
  })

  it("throws RefreshError('malformed_output') when provider returns no content field", async () => {
    requestLLMMock.mockResolvedValue({
      output: { summary: "ok", randomField: "not a content field" },
      provider: "openrouter",
    })

    await expect(refreshPack("u-1", "canary-autonomo")).rejects.toMatchObject({
      code: "malformed_output",
      providerName: "openrouter",
    })
    expect(upsertPackMock).not.toHaveBeenCalled()
  })

  it("throws RefreshError('truncated') when content ends with an ellipsis", async () => {
    requestLLMMock.mockResolvedValue({
      output: {
        content: LONG_CONTENT + "\n\n## Partial\nthis was cut off...",
        summary: "partial",
      },
      provider: "openai",
    })

    await expect(refreshPack("u-1", "canary-autonomo")).rejects.toMatchObject({
      code: "truncated",
    })
    expect(upsertPackMock).not.toHaveBeenCalled()
  })

  it("returns 'unchanged' and does NOT mark refreshed when content is byte-identical", async () => {
    requestLLMMock.mockResolvedValue({
      output: { content: LONG_CONTENT, summary: "no changes" },
      provider: "openai",
    })

    const result = await refreshPack("u-1", "canary-autonomo")
    expect(result.kind).toBe("unchanged")
    if (result.kind !== "unchanged") return
    expect(result.reason).toBe("content identical")
    expect(upsertPackMock).not.toHaveBeenCalled()
  })

  it("preserves pending-review content when a second refresh lands while pack is needs_review", async () => {
    const stashable = LONG_CONTENT
    getPackMock.mockResolvedValue({
      ...basePack,
      reviewStatus: "needs_review",
      content: stashable,
    })
    requestLLMMock.mockResolvedValue({
      output: {
        content: stashable + "\n\n## Added line.",
        summary: "another update",
      },
      provider: "openai",
    })

    await refreshPack("u-1", "canary-autonomo")
    expect(upsertPackMock).toHaveBeenCalledTimes(1)
    const arg = upsertPackMock.mock.calls[0]?.[0] as { pendingReviewContent: string | null }
    expect(arg.pendingReviewContent).toBe(stashable)
  })

  it("throws a RefreshError (not plain Error) so the tRPC layer can surface provider context", async () => {
    requestLLMMock.mockResolvedValue({
      output: {},
      provider: "mistral",
      error: "Mistral API rejected the request",
    })

    await expect(refreshPack("u-1", "canary-autonomo")).rejects.toBeInstanceOf(RefreshError)
  })
})
