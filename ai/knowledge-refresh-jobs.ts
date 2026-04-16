import { RefreshError, refreshPack } from "@/ai/knowledge-refresh"
import type { KnowledgePack } from "@/lib/db-types"
import { getPack, updatePackRefreshState } from "@/models/knowledge-packs"

type EnqueueResult = {
  accepted: boolean
  pack: KnowledgePack
}

type RefreshJobHooks = {
  onProgress: (message: string) => Promise<void>
}

const activeJobs = new Map<string, Promise<void>>()

function jobKey(userId: string, slug: string): string {
  return `${userId}:${slug}`
}

function formatFailureMessage(error: unknown): string {
  if (error instanceof RefreshError) {
    const provider = error.providerName ? `${error.providerName}: ` : ""
    return `${provider}${error.message}`
  }
  return error instanceof Error ? error.message : "refresh failed"
}

async function runKnowledgeRefreshJob(
  userId: string,
  slug: string,
  startedAt: Date,
  hooks: RefreshJobHooks,
): Promise<void> {
  await updatePackRefreshState(userId, slug, {
    refreshState: "running",
    refreshMessage: "Starting refresh…",
    refreshStartedAt: startedAt,
    refreshHeartbeatAt: new Date(),
  })

  try {
    const result = await refreshPack(userId, slug, {
      onProgress: hooks.onProgress,
    })

    await updatePackRefreshState(userId, slug, {
      refreshState: "succeeded",
      refreshMessage: result.kind === "unchanged" ? result.reason : result.summary,
      refreshStartedAt: startedAt,
      refreshFinishedAt: new Date(),
      refreshHeartbeatAt: new Date(),
    })
  } catch (error) {
    await updatePackRefreshState(userId, slug, {
      refreshState: "failed",
      refreshMessage: formatFailureMessage(error),
      refreshStartedAt: startedAt,
      refreshFinishedAt: new Date(),
      refreshHeartbeatAt: new Date(),
    })
  }
}

export async function enqueueKnowledgeRefresh(userId: string, slug: string): Promise<EnqueueResult> {
  const existing = await getPack(userId, slug)
  if (!existing) {
    throw new RefreshError("not_found", `Knowledge pack "${slug}" not found`)
  }

  const key = jobKey(userId, slug)
  if (activeJobs.has(key)) {
    return { accepted: false, pack: existing }
  }

  const startedAt = new Date()
  const queuedPack = await updatePackRefreshState(userId, slug, {
    refreshState: "queued",
    refreshMessage: "Queued refresh…",
    refreshStartedAt: startedAt,
    refreshFinishedAt: null,
    refreshHeartbeatAt: startedAt,
  })

  const job = Promise.resolve().then(() =>
    runKnowledgeRefreshJob(userId, slug, startedAt, {
      onProgress: async (message: string) => {
        await updatePackRefreshState(userId, slug, {
          refreshState: "running",
          refreshMessage: message,
          refreshStartedAt: startedAt,
          refreshHeartbeatAt: new Date(),
        })
      },
    }),
  ).finally(() => {
    activeJobs.delete(key)
  })

  activeJobs.set(key, job)

  return { accepted: true, pack: queuedPack }
}

export async function waitForKnowledgeRefreshJob(userId: string, slug: string): Promise<void> {
  await activeJobs.get(jobKey(userId, slug))
}

export function __resetKnowledgeRefreshJobsForTests(): void {
  activeJobs.clear()
}
