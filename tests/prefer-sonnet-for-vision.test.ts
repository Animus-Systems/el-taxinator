import { describe, expect, it } from "vitest"
import { preferSonnetForVision } from "@/models/settings"
import type { LLMSettings } from "@/ai/providers/llmProvider"

const base: LLMSettings = {
  providers: [
    {
      provider: "anthropic",
      apiKey: "",
      model: "claude-opus-4-7",
      modelIsDefault: false,
    },
    {
      provider: "codex",
      apiKey: "",
      model: "gpt-5.3-codex",
      modelIsDefault: false,
    },
    {
      provider: "openai",
      apiKey: "sk-x",
      model: "gpt-4o-mini",
      modelIsDefault: false,
    },
  ],
}

describe("preferSonnetForVision", () => {
  it("swaps Anthropic Opus models to Sonnet 4.6", () => {
    const result = preferSonnetForVision(base)
    expect(result.providers[0]?.model).toBe("claude-sonnet-4-6")
  })

  it("leaves non-Anthropic providers untouched", () => {
    const result = preferSonnetForVision(base)
    expect(result.providers[1]?.model).toBe("gpt-5.3-codex")
    expect(result.providers[2]?.model).toBe("gpt-4o-mini")
  })

  it("preserves Anthropic non-Opus models (Sonnet, Haiku)", () => {
    const keep = preferSonnetForVision({
      providers: [
        { provider: "anthropic", apiKey: "", model: "claude-sonnet-4-6", modelIsDefault: false },
        { provider: "anthropic", apiKey: "", model: "claude-haiku-4-5", modelIsDefault: false },
      ],
    })
    expect(keep.providers[0]?.model).toBe("claude-sonnet-4-6")
    expect(keep.providers[1]?.model).toBe("claude-haiku-4-5")
  })

  it("handles future Opus versions (claude-opus-5-x, etc.) via prefix match", () => {
    const result = preferSonnetForVision({
      providers: [
        { provider: "anthropic", apiKey: "", model: "claude-opus-5-2-20271231", modelIsDefault: false },
      ],
    })
    expect(result.providers[0]?.model).toBe("claude-sonnet-4-6")
  })

  it("does not mutate the input", () => {
    const input: LLMSettings = {
      providers: [
        { provider: "anthropic", apiKey: "", model: "claude-opus-4-7", modelIsDefault: false },
      ],
    }
    preferSonnetForVision(input)
    expect(input.providers[0]?.model).toBe("claude-opus-4-7")
  })
})
