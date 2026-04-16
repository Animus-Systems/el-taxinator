import { describe, expect, it } from "vitest"

import { pickRelevantPacks } from "@/ai/wizard-prompt"
import type { KnowledgePack } from "@/lib/db-types"

function pack(slug: string): KnowledgePack {
  return {
    id: slug,
    userId: "u",
    slug,
    title: slug,
    content: "# " + slug,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const all: KnowledgePack[] = [
  pack("canary-autonomo"),
  pack("canary-sl"),
  pack("personal-tax"),
  pack("property-tax"),
  pack("crypto-tax"),
]

describe("pickRelevantPacks", () => {
  it("returns entity pack first, then topic packs for autónomo", () => {
    const slugs = pickRelevantPacks(all, "autonomo").map((p) => p.slug)
    expect(slugs).toEqual([
      "canary-autonomo",
      "personal-tax",
      "property-tax",
      "crypto-tax",
    ])
  })

  it("includes only SL pack plus topic packs for SL (no personal-tax)", () => {
    const slugs = pickRelevantPacks(all, "sl").map((p) => p.slug)
    expect(slugs).toEqual([
      "canary-sl",
      "property-tax",
      "crypto-tax",
    ])
  })

  it("returns personal-tax first and topics for individual entity", () => {
    const slugs = pickRelevantPacks(all, "individual").map((p) => p.slug)
    expect(slugs).toEqual([
      "personal-tax",
      "property-tax",
      "crypto-tax",
    ])
  })

  it("falls back to first pack when entity type is null and no topic packs exist", () => {
    const slugs = pickRelevantPacks([pack("canary-autonomo")], null).map((p) => p.slug)
    expect(slugs).toEqual(["canary-autonomo"])
  })

  it("omits a topic pack silently if it hasn't been seeded yet", () => {
    const slugs = pickRelevantPacks(
      [pack("canary-autonomo"), pack("personal-tax"), pack("crypto-tax")],
      "autonomo",
    ).map((p) => p.slug)
    expect(slugs).toEqual([
      "canary-autonomo",
      "personal-tax",
      "crypto-tax",
    ])
  })

  it("returns empty array when no packs exist", () => {
    expect(pickRelevantPacks([], "autonomo")).toEqual([])
  })
})
