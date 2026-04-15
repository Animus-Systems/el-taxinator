import fs from "node:fs/promises"
import path from "node:path"
import { requestLLM } from "./providers/llmProvider"
import type { KnowledgePack } from "@/lib/db-types"
import { getPack, upsertPack, insertPackIfMissing } from "@/models/knowledge-packs"
import { getSettings, getLLMSettings } from "@/models/settings"

// ---------------------------------------------------------------------------
// Seed bootstrap
// ---------------------------------------------------------------------------

export type SeedPackDef = {
  slug: string
  title: string
  file: string // relative to ai/knowledge/
}

export const SEED_PACKS: SeedPackDef[] = [
  {
    slug: "canary-autonomo",
    title: "Canary Islands — Autónomo tax knowledge",
    file: "seed-canary-autonomo.md",
  },
  {
    slug: "canary-sl",
    title: "Canary Islands — Sociedad Limitada tax knowledge",
    file: "seed-canary-sl.md",
  },
]

async function loadSeedContent(file: string): Promise<string> {
  const abs = path.join(process.cwd(), "ai", "knowledge", file)
  return fs.readFile(abs, "utf-8")
}

/**
 * Insert baseline packs for a user if they don't exist. Idempotent — safe
 * to call on every user creation and on migration roll-forwards. Preserves
 * any user-edited content (uses insertPackIfMissing, not upsert).
 */
export async function seedKnowledgePacksForUser(userId: string): Promise<number> {
  let inserted = 0
  for (const seed of SEED_PACKS) {
    try {
      const existing = await getPack(userId, seed.slug)
      if (existing) continue
      const content = await loadSeedContent(seed.file)
      await insertPackIfMissing({
        userId,
        slug: seed.slug,
        title: seed.title,
        content,
        reviewStatus: "seed",
        refreshIntervalDays: 30,
      })
      inserted += 1
    } catch (err) {
      console.warn(`[knowledge] Failed to seed pack ${seed.slug}:`, err instanceof Error ? err.message : err)
    }
  }
  return inserted
}

/**
 * Find the original seed content for a pack (used by "reset to seed").
 */
export async function readSeedContent(slug: string): Promise<{ title: string; content: string } | null> {
  const seed = SEED_PACKS.find((s) => s.slug === slug)
  if (!seed) return null
  const content = await loadSeedContent(seed.file)
  return { title: seed.title, content }
}

// ---------------------------------------------------------------------------
// LLM-driven refresh
// ---------------------------------------------------------------------------

export const REFRESH_PROMPT = `You are updating a knowledge document about Canary Islands accounting.

Review the current content below for accuracy as of today's date. Add any rate
or deadline changes you are aware of. Cite BOE articles, Modelo casilla numbers,
or LIRPF/LIS sections whenever you make a claim. If you are uncertain about a
specific rate or reference, flag it inline with ⚠ rather than inventing one.

Preserve the heading structure and the "Last verified" line (update the date).
Return ONLY the full updated markdown — no JSON, no preamble, no commentary.

---

`

export type RefreshResult = {
  pack: KnowledgePack
  provider: string
  model: string | null
  tokensUsed: number | null
  diffSummary: {
    sizeBefore: number
    sizeAfter: number
    headingCountBefore: number
    headingCountAfter: number
  }
}

export async function refreshPack(userId: string, slug: string): Promise<RefreshResult> {
  const current = await getPack(userId, slug)
  if (!current) throw new Error(`Knowledge pack "${slug}" not found`)

  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)
  if (llmSettings.providers.length === 0) {
    throw new Error("No LLM providers configured — add one in Settings → LLM before refreshing knowledge packs.")
  }

  const prompt = REFRESH_PROMPT + current.content
  const response = await requestLLM(llmSettings, { prompt })
  if (response.error) {
    throw new Error(`LLM refresh failed: ${response.error}`)
  }

  const rawContent = extractMarkdown(response.output)
  if (!rawContent || rawContent.trim().length < 200) {
    throw new Error("LLM returned no usable content")
  }

  const updated = await upsertPack({
    userId,
    slug: current.slug,
    title: current.title,
    content: rawContent,
    sourcePrompt: REFRESH_PROMPT,
    refreshIntervalDays: current.refreshIntervalDays,
    provider: response.provider,
    model: null,
    reviewStatus: "needs_review",
    markRefreshed: true,
  })

  return {
    pack: updated,
    provider: response.provider,
    model: null,
    tokensUsed: response.tokensUsed ?? null,
    diffSummary: {
      sizeBefore: current.content.length,
      sizeAfter: updated.content.length,
      headingCountBefore: countHeadings(current.content),
      headingCountAfter: countHeadings(updated.content),
    },
  }
}

function extractMarkdown(output: unknown): string {
  // `requestLLM` returns structured JSON for providers that honor a schema,
  // but here we sent no schema — the model should return plain text. For
  // compatibility we accept either:
  //   - a string
  //   - an object with a `content`, `markdown`, or `text` field
  if (typeof output === "string") return output
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>
    if (typeof obj.content === "string") return obj.content
    if (typeof obj.markdown === "string") return obj.markdown
    if (typeof obj.text === "string") return obj.text
  }
  return ""
}

function countHeadings(markdown: string): number {
  const matches = markdown.match(/^#{1,3}\s/gm)
  return matches ? matches.length : 0
}
