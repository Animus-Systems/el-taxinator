import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  refreshPack: vi.fn(),
  getPack: vi.fn(),
  updatePackRefreshState: vi.fn(),
}))

vi.mock("@/ai/knowledge-refresh", () => ({
  refreshPack: (...args: unknown[]) => mocks.refreshPack(...args),
  RefreshError: class MockRefreshError extends Error {
    readonly code: string
    readonly providerName: string | null
    readonly modelName: string | null

    constructor(code: string, message: string, providerName: string | null = null, modelName: string | null = null) {
      super(message)
      this.name = "RefreshError"
      this.code = code
      this.providerName = providerName
      this.modelName = modelName
    }
  },
}))

vi.mock("@/models/knowledge-packs", () => ({
  getPack: (...args: unknown[]) => mocks.getPack(...args),
  updatePackRefreshState: (...args: unknown[]) => mocks.updatePackRefreshState(...args),
}))

import {
  __resetKnowledgeRefreshJobsForTests,
  enqueueKnowledgeRefresh,
  waitForKnowledgeRefreshJob,
} from "@/ai/knowledge-refresh-jobs"

const basePack = {
  id: "pack-1",
  userId: "u-1",
  slug: "canary-autonomo",
  title: "Canary Islands — Autónomo tax knowledge",
  content: "## Seed\ncontent",
  sourcePrompt: null,
  lastRefreshedAt: null,
  refreshIntervalDays: 30,
  provider: null,
  model: null,
  reviewStatus: "seed",
  refreshState: "idle",
  refreshMessage: null,
  refreshStartedAt: null,
  refreshFinishedAt: null,
  refreshHeartbeatAt: null,
  pendingReviewContent: null,
  createdAt: new Date("2026-04-16T00:00:00.000Z"),
  updatedAt: new Date("2026-04-16T00:00:00.000Z"),
}

describe("knowledge refresh jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetKnowledgeRefreshJobsForTests()
    mocks.getPack.mockResolvedValue({ ...basePack })
    mocks.updatePackRefreshState.mockImplementation(
      async (_userId: string, _slug: string, patch: Record<string, unknown>) => ({
        ...basePack,
        ...patch,
      }),
    )
  })

  afterEach(() => {
    __resetKnowledgeRefreshJobsForTests()
  })

  it("queues a refresh job, marks it running, and completes it in the background", async () => {
    mocks.refreshPack.mockResolvedValue({
      kind: "unchanged",
      pack: {
        ...basePack,
        refreshState: "succeeded",
        refreshMessage: "content identical",
        refreshFinishedAt: new Date("2026-04-16T12:00:00.000Z"),
        refreshHeartbeatAt: new Date("2026-04-16T12:00:00.000Z"),
      },
      provider: "anthropic",
      model: null,
      tokensUsed: null,
      reason: "content identical",
    })

    const queued = await enqueueKnowledgeRefresh("u-1", "canary-autonomo")

    expect(queued.accepted).toBe(true)
    expect(queued.pack.refreshState).toBe("queued")

    await waitForKnowledgeRefreshJob("u-1", "canary-autonomo")

    expect(mocks.updatePackRefreshState).toHaveBeenCalledWith(
      "u-1",
      "canary-autonomo",
      expect.objectContaining({ refreshState: "queued" }),
    )
    expect(mocks.updatePackRefreshState).toHaveBeenCalledWith(
      "u-1",
      "canary-autonomo",
      expect.objectContaining({ refreshState: "running" }),
    )
    expect(mocks.refreshPack).toHaveBeenCalledWith(
      "u-1",
      "canary-autonomo",
      expect.any(Object),
    )
    expect(mocks.updatePackRefreshState).toHaveBeenCalledWith(
      "u-1",
      "canary-autonomo",
      expect.objectContaining({
        refreshState: "succeeded",
        refreshMessage: "content identical",
      }),
    )
  })

  it("does not enqueue a duplicate job while one is already active", async () => {
    mocks.refreshPack.mockImplementation(() => new Promise(() => {}))

    const first = await enqueueKnowledgeRefresh("u-1", "canary-autonomo")
    const second = await enqueueKnowledgeRefresh("u-1", "canary-autonomo")

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(false)
    expect(mocks.refreshPack).toHaveBeenCalledTimes(1)
  })

  it("records a failed background refresh with provider context", async () => {
    const { RefreshError } = await import("@/ai/knowledge-refresh")
    mocks.refreshPack.mockRejectedValue(
      new RefreshError("all_providers_failed", "timed out after 600s", "anthropic", null),
    )

    await enqueueKnowledgeRefresh("u-1", "canary-autonomo")
    await waitForKnowledgeRefreshJob("u-1", "canary-autonomo")

    expect(mocks.updatePackRefreshState).toHaveBeenCalledWith(
      "u-1",
      "canary-autonomo",
      expect.objectContaining({
        refreshState: "failed",
        refreshMessage: expect.stringContaining("anthropic"),
      }),
    )
  })
})
