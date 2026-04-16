import { describe, expect, it } from "vitest"
import { PROVIDERS } from "@/lib/llm-providers"

describe("PROVIDERS list", () => {
  it("contains expected provider keys", () => {
    const keys = PROVIDERS.map((p) => p.key)
    expect(keys).toContain("openai")
    expect(keys).toContain("google")
    expect(keys).toContain("mistral")
    expect(keys).toContain("anthropic")
    expect(keys).toContain("codex")
  })

  it("has at least 5 providers", () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(5)
  })

  it("each provider has all required fields", () => {
    for (const provider of PROVIDERS) {
      expect(provider.key).toBeTruthy()
      expect(provider.label).toBeTruthy()
      expect(typeof provider.isSubscription).toBe("boolean")
      expect(provider.apiKeyName).toBeTruthy()
      expect(provider.modelName).toBeTruthy()
      expect(Array.isArray(provider.models)).toBe(true)
      expect(typeof provider.supportsThinking).toBe("boolean")
      expect(provider.logo).toBeTruthy()
    }
  })

  it("non-custom providers have models, default model, and docs", () => {
    for (const provider of PROVIDERS.filter((p) => p.key !== "custom")) {
      expect(provider.defaultModelName).toBeTruthy()
      expect(provider.models.length).toBeGreaterThan(0)
      expect(provider.apiDoc).toBeTruthy()
      expect(provider.apiDocLabel).toBeTruthy()
    }
  })

  it("each provider has unique key", () => {
    const keys = PROVIDERS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("Provider model configurations", () => {
  it("each model has id and name", () => {
    for (const provider of PROVIDERS) {
      for (const model of provider.models) {
        expect(model.id).toBeTruthy()
        expect(model.name).toBeTruthy()
      }
    }
  })

  it("default model exists in the model list", () => {
    for (const provider of PROVIDERS.filter((p) => p.key !== "custom")) {
      const modelIds = provider.models.map((m) => m.id)
      expect(modelIds).toContain(provider.defaultModelName)
    }
  })
})

describe("OpenAI provider", () => {
  const openai = PROVIDERS.find((p) => p.key === "openai")!

  it("exists", () => {
    expect(openai).toBeDefined()
  })

  it("has correct default model", () => {
    expect(openai.defaultModelName).toBe("gpt-4o-mini")
  })

  it("is not a subscription provider", () => {
    expect(openai.isSubscription).toBe(false)
  })

  it("does not support thinking", () => {
    expect(openai.supportsThinking).toBe(false)
  })

  it("has placeholder starting with sk-", () => {
    expect(openai.placeholder).toMatch(/^sk-/)
  })
})

describe("Google provider", () => {
  const google = PROVIDERS.find((p) => p.key === "google")!

  it("exists", () => {
    expect(google).toBeDefined()
  })

  it("has correct default model", () => {
    expect(google.defaultModelName).toBe("gemini-2.5-flash")
  })

  it("is not a subscription provider", () => {
    expect(google.isSubscription).toBe(false)
  })
})

describe("Anthropic provider", () => {
  const anthropic = PROVIDERS.find((p) => p.key === "anthropic")!

  it("exists", () => {
    expect(anthropic).toBeDefined()
  })

  it("has correct default model", () => {
    expect(anthropic.defaultModelName).toBe("claude-sonnet-4-6")
  })

  it("is a subscription provider", () => {
    expect(anthropic.isSubscription).toBe(true)
  })

  it("supports thinking", () => {
    expect(anthropic.supportsThinking).toBe(true)
  })

  it("has thinking options", () => {
    expect(anthropic.thinkingOptions.length).toBeGreaterThan(0)
    const ids = anthropic.thinkingOptions.map((o) => o.id)
    expect(ids).toContain("low")
    expect(ids).toContain("medium")
    expect(ids).toContain("high")
  })

  it("has thinking setting name", () => {
    expect(anthropic.thinkingSettingName).toBe("anthropic_thinking")
  })
})

describe("Mistral provider", () => {
  const mistral = PROVIDERS.find((p) => p.key === "mistral")!

  it("exists", () => {
    expect(mistral).toBeDefined()
  })

  it("has correct default model", () => {
    expect(mistral.defaultModelName).toBe("mistral-medium-latest")
  })

  it("is not a subscription provider", () => {
    expect(mistral.isSubscription).toBe(false)
  })
})

describe("Codex provider", () => {
  const codex = PROVIDERS.find((p) => p.key === "codex")!

  it("exists", () => {
    expect(codex).toBeDefined()
  })

  it("is a subscription provider", () => {
    expect(codex.isSubscription).toBe(true)
  })

  it("does not support thinking", () => {
    expect(codex.supportsThinking).toBe(false)
  })

  it("has correct default model", () => {
    expect(codex.defaultModelName).toBe("gpt-5.3-codex")
  })
})

describe("Provider help links", () => {
  const providersWithDocs = PROVIDERS.filter((p) => p.key !== "custom")

  it("every non-custom provider has a valid help URL", () => {
    for (const provider of providersWithDocs) {
      expect(provider.help.url).toMatch(/^https?:\/\//)
      expect(provider.help.label).toBeTruthy()
    }
  })

  it("every non-custom provider has a valid API doc URL", () => {
    for (const provider of providersWithDocs) {
      expect(provider.apiDoc).toMatch(/^https?:\/\//)
    }
  })

  it("custom provider has empty docs (user-supplied)", () => {
    const custom = PROVIDERS.find((p) => p.key === "custom")!
    expect(custom).toBeDefined()
    expect(custom.defaultModelName).toBe("")
    expect(custom.models).toHaveLength(0)
    expect(custom.apiDoc).toBe("")
    expect(custom.freeformModel).toBe(true)
  })
})
