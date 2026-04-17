import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
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
  {
    slug: "personal-tax",
    title: "Personal tax (IRPF / Modelo 100)",
    file: "seed-individual.md",
  },
  {
    slug: "property-tax",
    title: "Property tax (rental, IBI, plusvalía, wealth)",
    file: "seed-property-tax.md",
  },
  {
    slug: "crypto-tax",
    title: "Crypto tax (FIFO, Modelo 721, staking)",
    file: "seed-crypto-tax.md",
  },
  {
    slug: "filing-modelo-420",
    title: "Filing Modelo 420 (IGIC quarterly)",
    file: "seed-filing-modelo-420.md",
  },
  {
    slug: "filing-modelo-130",
    title: "Filing Modelo 130 (IRPF quarterly, autónomo)",
    file: "seed-filing-modelo-130.md",
  },
  {
    slug: "filing-modelo-202",
    title: "Filing Modelo 202 (IS quarterly, SL)",
    file: "seed-filing-modelo-202.md",
  },
  {
    slug: "filing-modelo-100",
    title: "Filing Modelo 100 (annual IRPF / Renta)",
    file: "seed-filing-modelo-100.md",
  },
  {
    slug: "filing-modelo-425",
    title: "Filing Modelo 425 (annual IGIC recap)",
    file: "seed-filing-modelo-425.md",
  },
  {
    slug: "filing-modelo-721",
    title: "Filing Modelo 721 (informative foreign crypto)",
    file: "seed-filing-modelo-721.md",
  },
]

/**
 * Topic description fed into the refresh prompt so the LLM knows what the
 * pack is about, rather than assuming "Canary Islands accounting" for
 * every slug.
 */
const TOPIC_DESC: Record<string, string> = {
  "canary-autonomo":
    "Canary Islands autónomo tax (IGIC rates, quarterly IRPF retenciones, Modelo 420/130/425/100 deadlines and content)",
  "canary-sl":
    "Canary Islands Sociedad Limitada tax (IGIC + corporate tax, Modelo 420/202/200/111/115/425/190)",
  "personal-tax":
    "Spanish personal income tax (IRPF / Modelo 100) — base general and base del ahorro brackets, employment, rental, activity income, deductions, retenciones, filing triggers",
  "property-tax":
    "Spanish property tax — rental income rules, 60%/70%/90% reductions, deductible rental expenses, IBI, plusvalía municipal, ITP / AJD, primary-residence exemption, wealth tax (Modelo 714) with Canarias bonificación",
  "crypto-tax":
    "Spanish crypto tax — realisation events, mandatory FIFO cost basis, staking/airdrop rendimiento del capital mobiliario, mining as actividad económica, Modelo 721 informativa, wash-sale (norma antiaplicación)",
  "filing-modelo-420":
    "Step-by-step procedure for filing Modelo 420 (quarterly IGIC) on the Agencia Tributaria Canaria sede electrónica — portal URLs, certificate/Cl@ve login, casilla-by-casilla instructions, NRC/domiciliación payment flow, downloading the justificante, common validation errors. Keep the content procedural, do not drift into tax-rate theory.",
  "filing-modelo-130":
    "Step-by-step procedure for filing Modelo 130 (quarterly IRPF autónomo) on the AEAT sede electrónica — portal URL, Cl@ve / certificate login, casilla 01–06 instructions, NRC or domiciliación payment, complementaria flow, downloading the justificante, common errors. Keep the content procedural.",
  "filing-modelo-202":
    "Step-by-step procedure for filing Modelo 202 (quarterly IS pago fraccionado for SL) on the AEAT sede electrónica — SL certificate login, modalidad 1 vs modalidad 2 selection, casilla 01–05 instructions, NRC/domiciliación payment, quarter-by-quarter deadlines (April/October/December), justificante. Keep the content procedural.",
  "filing-modelo-100":
    "Step-by-step procedure for filing Modelo 100 (annual IRPF / Renta) via Renta Web on AEAT — login options (Cl@ve, certificado, número de referencia), block-by-block review of the borrador, manually adding crypto disposals from Modelo 721 data, joint vs individual simulation, ingreso / domiciliación / fraccionamiento options, devolución IBAN, justificante. Keep the content procedural.",
  "filing-modelo-425":
    "Step-by-step procedure for filing Modelo 425 (annual IGIC recap) on the ATC sede electrónica — login, prefill from the four Modelo 420 quarterly submissions, volume distribution by IGIC rate, deducible totals, requesting pending devolución, reconciling mismatches with complementarias. Keep the content procedural.",
  "filing-modelo-721":
    "Step-by-step procedure for filing Modelo 721 (informative foreign crypto) on AEAT — when the €50k threshold applies, certificate login preference, per-custodian record entry (name, country, currency, quantity, EUR valuation at 31 Dec), sanctions for non-filing, retention period. Keep the content procedural.",
}

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

/**
 * The envelope we ask every provider to return. Passing a schema makes
 * `.withStructuredOutput` work for API-key providers, and for CLI providers
 * the schema is appended as an instruction. Returning structured fields
 * (not a raw string) eliminates the silent-empty-string failure mode.
 */
const REFRESH_ENVELOPE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description:
        "The full updated markdown of the knowledge pack. Preserve heading structure. Do not abbreviate. This is the whole pack, not a diff.",
    },
    summary: {
      type: "string",
      description: "One-sentence summary of what was changed or verified.",
    },
    citations: {
      type: "array",
      items: { type: "string" },
      description:
        "BOE articles, Modelo casilla numbers, or LIRPF/LIS sections cited in the content.",
    },
  },
  required: ["content", "summary"],
}

const KNOWLEDGE_REFRESH_TIMEOUT_MS = 600_000

function buildRefreshPrompt(slug: string, currentContent: string): string {
  const topic = TOPIC_DESC[slug] ?? "Spanish tax knowledge"
  return `You are updating a knowledge document about ${topic}.

Review the content below for accuracy as of today's date. Correct any
outdated rates, thresholds, or deadlines. Add rate or deadline changes you
are aware of. Cite BOE articles, Modelo casilla numbers, or LIRPF/LIS
sections whenever you make a claim. If uncertain about a specific rate,
flag it inline with ⚠ rather than inventing one.

Preserve the heading structure and the "Last verified" line (update the
date to today). Keep roughly the same length — do not abbreviate.

Return your answer in the provided JSON envelope. The "content" field MUST
contain the FULL updated markdown, not a diff or summary.

---

${currentContent}`
}

export type RefreshChanged = {
  kind: "updated"
  pack: KnowledgePack
  provider: string
  model: string | null
  tokensUsed: number | null
  summary: string
  citations: string[]
  diffSummary: {
    sizeBefore: number
    sizeAfter: number
    headingCountBefore: number
    headingCountAfter: number
  }
}

export type RefreshUnchanged = {
  kind: "unchanged"
  pack: KnowledgePack
  provider: string
  model: string | null
  tokensUsed: number | null
  reason: string
}

export type RefreshResult = RefreshChanged | RefreshUnchanged

export type RefreshProgressCallback = (message: string) => void | Promise<void>

export class RefreshError extends Error {
  readonly code: "no_providers" | "all_providers_failed" | "malformed_output" | "truncated" | "not_found"
  readonly providerName: string | null
  readonly modelName: string | null
  constructor(
    code: RefreshError["code"],
    message: string,
    providerName: string | null = null,
    modelName: string | null = null,
  ) {
    super(message)
    this.name = "RefreshError"
    this.code = code
    this.providerName = providerName
    this.modelName = modelName
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function countHeadings(markdown: string): number {
  const matches = markdown.match(/^#{1,3}\s/gm)
  return matches ? matches.length : 0
}

function isProbablyTruncated(content: string): boolean {
  const trimmed = content.trimEnd()
  if (trimmed.endsWith("...") || trimmed.endsWith("…")) return true
  const lastLine = trimmed.split("\n").pop() ?? ""
  // Unterminated code fence or half-word suffix with no trailing newline is
  // suspicious. Too aggressive would reject valid lists, so keep this narrow.
  if (lastLine === "```") return true
  return false
}

type Envelope = {
  content: string
  summary: string
  citations?: string[]
}

function parseEnvelope(output: unknown): Envelope | null {
  if (!output || typeof output !== "object") return null
  const obj = output as Record<string, unknown>
  const content = typeof obj["content"] === "string" ? obj["content"] : null
  if (!content) return null
  const summary =
    typeof obj["summary"] === "string" ? obj["summary"] : "Refreshed"
  const citationsRaw = obj["citations"]
  const citations = Array.isArray(citationsRaw)
    ? citationsRaw.filter((c): c is string => typeof c === "string")
    : []
  return { content, summary, citations }
}

function formatProviderProgressEvent(event: { type: string; provider: string; attempt?: number; total?: number; elapsedMs?: number; error?: string }): string | null {
  if (event.type === "provider_attempt") {
    return `Trying ${event.provider} (${event.attempt}/${event.total})…`
  }
  if (event.type === "provider_waiting" && typeof event.elapsedMs === "number") {
    return `Waiting on ${event.provider}… ${Math.max(1, Math.round(event.elapsedMs / 1000))}s elapsed`
  }
  if (event.type === "provider_failed" && event.error) {
    return `${event.provider} failed: ${event.error}`
  }
  if (event.type === "provider_succeeded") {
    return `${event.provider} responded`
  }
  return null
}

export async function refreshPack(
  userId: string,
  slug: string,
  options?: {
    onProgress?: RefreshProgressCallback
  },
): Promise<RefreshResult> {
  const current = await getPack(userId, slug)
  if (!current) {
    throw new RefreshError("not_found", `Knowledge pack "${slug}" not found`)
  }

  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)
  if (llmSettings.providers.length === 0) {
    throw new RefreshError(
      "no_providers",
      "No LLM providers configured — add one in Settings → LLM before refreshing knowledge packs.",
    )
  }

  const prompt = buildRefreshPrompt(slug, current.content)
  await options?.onProgress?.("Preparing refresh request…")
  const response = await requestLLM(
    llmSettings,
    { prompt, schema: REFRESH_ENVELOPE_SCHEMA },
    KNOWLEDGE_REFRESH_TIMEOUT_MS,
    {
      onEvent: async (event) => {
        const message = formatProviderProgressEvent(event)
        if (message) {
          await options?.onProgress?.(message)
        }
      },
    },
  )
  if (response.error) {
    throw new RefreshError(
      "all_providers_failed",
      response.error,
      response.provider ?? null,
      null,
    )
  }

  const envelope = parseEnvelope(response.output)
  if (!envelope || envelope.content.trim().length < 200) {
    throw new RefreshError(
      "malformed_output",
      "LLM returned no usable content — the provider may not honour the structured output schema.",
      response.provider ?? null,
      null,
    )
  }

  if (isProbablyTruncated(envelope.content)) {
    throw new RefreshError(
      "truncated",
      "LLM response appears truncated — try a provider with a larger output limit.",
      response.provider ?? null,
      null,
    )
  }

  // If content is byte-for-byte identical, still mark the pack as freshly
  // checked. Otherwise a successful refresh can remain permanently stale in
  // the sidebar and settings screen even though the content was just verified.
  if (sha256(envelope.content) === sha256(current.content)) {
    const refreshed = await upsertPack({
      userId,
      slug: current.slug,
      title: current.title,
      content: current.content,
      sourcePrompt: prompt,
      refreshIntervalDays: current.refreshIntervalDays,
      provider: response.provider,
      model: current.model,
      reviewStatus: current.reviewStatus as "verified" | "needs_review" | "seed",
      markRefreshed: true,
      refreshState: "succeeded",
      refreshMessage: "content identical",
      refreshFinishedAt: new Date(),
      refreshHeartbeatAt: new Date(),
      pendingReviewContent: current.pendingReviewContent,
    })

    return {
      kind: "unchanged",
      pack: refreshed,
      provider: response.provider,
      model: null,
      tokensUsed: response.tokensUsed ?? null,
      reason: "content identical",
    }
  }

  const preserveUnreviewed =
    current.reviewStatus === "needs_review" ? current.content : null

  const updated = await upsertPack({
    userId,
    slug: current.slug,
    title: current.title,
    content: envelope.content,
    sourcePrompt: prompt,
    refreshIntervalDays: current.refreshIntervalDays,
    provider: response.provider,
    model: null,
    reviewStatus: "needs_review",
    markRefreshed: true,
    refreshState: "succeeded",
    refreshMessage: envelope.summary,
    refreshFinishedAt: new Date(),
    refreshHeartbeatAt: new Date(),
    pendingReviewContent: preserveUnreviewed,
  })

  return {
    kind: "updated",
    pack: updated,
    provider: response.provider,
    model: null,
    tokensUsed: response.tokensUsed ?? null,
    summary: envelope.summary,
    citations: envelope.citations ?? [],
    diffSummary: {
      sizeBefore: current.content.length,
      sizeAfter: updated.content.length,
      headingCountBefore: countHeadings(current.content),
      headingCountAfter: countHeadings(updated.content),
    },
  }
}
