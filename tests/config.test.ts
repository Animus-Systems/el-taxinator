import { describe, expect, it } from "vitest"
import { z } from "zod"

// Re-create the env schema from config.ts to test validation without side effects
const envSchema = z.object({
  BASE_URL: z.string().url().default("http://localhost:7331"),
  PORT: z.string().default("7331"),
  SELF_HOSTED_MODE: z.enum(["true", "false"]).default("true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_NAME: z.string().default("gpt-4o-mini"),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL_NAME: z.string().default("gemini-2.5-flash"),
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL_NAME: z.string().default("mistral-medium-latest"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_NAME: z.string().default("claude-sonnet-4-6"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "Auth secret must be at least 16 characters")
    .default("please-set-your-key-here"),
  DISABLE_SIGNUP: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z.string().default("please-set-your-resend-api-key-here"),
  RESEND_FROM_EMAIL: z.string().default("Taxinator <user@localhost>"),
  RESEND_AUDIENCE_ID: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
})

describe("Config schema validation", () => {
  it("validates correct minimal env values with defaults", () => {
    const result = envSchema.parse({})

    expect(result.BASE_URL).toBe("http://localhost:7331")
    expect(result.PORT).toBe("7331")
    expect(result.SELF_HOSTED_MODE).toBe("true")
    expect(result.OPENAI_MODEL_NAME).toBe("gpt-4o-mini")
    expect(result.GOOGLE_MODEL_NAME).toBe("gemini-2.5-flash")
    expect(result.MISTRAL_MODEL_NAME).toBe("mistral-medium-latest")
    expect(result.ANTHROPIC_MODEL_NAME).toBe("claude-sonnet-4-6")
    expect(result.DISABLE_SIGNUP).toBe("false")
  })

  it("validates correct full env values", () => {
    const result = envSchema.parse({
      BASE_URL: "https://taxinator.example.com",
      PORT: "8080",
      SELF_HOSTED_MODE: "false",
      OPENAI_API_KEY: "sk-test-key",
      BETTER_AUTH_SECRET: "a-very-long-secret-key-here",
      DISABLE_SIGNUP: "true",
    })

    expect(result.BASE_URL).toBe("https://taxinator.example.com")
    expect(result.PORT).toBe("8080")
    expect(result.SELF_HOSTED_MODE).toBe("false")
    expect(result.OPENAI_API_KEY).toBe("sk-test-key")
    expect(result.DISABLE_SIGNUP).toBe("true")
  })

  it("rejects invalid BASE_URL", () => {
    expect(() =>
      envSchema.parse({ BASE_URL: "not-a-url" })
    ).toThrow()
  })

  it("rejects empty string as BASE_URL", () => {
    expect(() =>
      envSchema.parse({ BASE_URL: "" })
    ).toThrow()
  })

  it("rejects invalid SELF_HOSTED_MODE values", () => {
    expect(() =>
      envSchema.parse({ SELF_HOSTED_MODE: "yes" })
    ).toThrow()
  })

  it("rejects auth secret shorter than 16 characters", () => {
    expect(() =>
      envSchema.parse({ BETTER_AUTH_SECRET: "short" })
    ).toThrow()
  })

  it("accepts auth secret exactly 16 characters", () => {
    const result = envSchema.parse({ BETTER_AUTH_SECRET: "1234567890123456" })
    expect(result.BETTER_AUTH_SECRET).toBe("1234567890123456")
  })

  it("rejects invalid DISABLE_SIGNUP values", () => {
    expect(() =>
      envSchema.parse({ DISABLE_SIGNUP: "yes" })
    ).toThrow()
  })
})

describe("Self-hosted mode detection", () => {
  it("detects self-hosted mode when SELF_HOSTED_MODE is 'true'", () => {
    const env = envSchema.parse({ SELF_HOSTED_MODE: "true" })
    expect(env.SELF_HOSTED_MODE === "true").toBe(true)
  })

  it("detects non-self-hosted mode when SELF_HOSTED_MODE is 'false'", () => {
    const env = envSchema.parse({ SELF_HOSTED_MODE: "false" })
    expect(env.SELF_HOSTED_MODE === "true").toBe(false)
  })
})

describe("Auth settings logic", () => {
  it("disableSignup is true when self-hosted mode is enabled", () => {
    const env = envSchema.parse({ SELF_HOSTED_MODE: "true", DISABLE_SIGNUP: "false" })
    const disableSignup = env.DISABLE_SIGNUP === "true" || env.SELF_HOSTED_MODE === "true"
    expect(disableSignup).toBe(true)
  })

  it("disableSignup is true when DISABLE_SIGNUP is explicitly true", () => {
    const env = envSchema.parse({ SELF_HOSTED_MODE: "false", DISABLE_SIGNUP: "true" })
    const disableSignup = env.DISABLE_SIGNUP === "true" || env.SELF_HOSTED_MODE === "true"
    expect(disableSignup).toBe(true)
  })

  it("disableSignup is false when both self-hosted and DISABLE_SIGNUP are false", () => {
    const env = envSchema.parse({ SELF_HOSTED_MODE: "false", DISABLE_SIGNUP: "false" })
    const disableSignup = env.DISABLE_SIGNUP === "true" || env.SELF_HOSTED_MODE === "true"
    expect(disableSignup).toBe(false)
  })
})

describe("Default values for optional fields", () => {
  it("OPENAI_API_KEY is undefined when not provided", () => {
    const result = envSchema.parse({})
    expect(result.OPENAI_API_KEY).toBeUndefined()
  })

  it("GOOGLE_API_KEY is undefined when not provided", () => {
    const result = envSchema.parse({})
    expect(result.GOOGLE_API_KEY).toBeUndefined()
  })

  it("MISTRAL_API_KEY is undefined when not provided", () => {
    const result = envSchema.parse({})
    expect(result.MISTRAL_API_KEY).toBeUndefined()
  })

  it("ANTHROPIC_API_KEY is undefined when not provided", () => {
    const result = envSchema.parse({})
    expect(result.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it("STRIPE_SECRET_KEY defaults to empty string", () => {
    const result = envSchema.parse({})
    expect(result.STRIPE_SECRET_KEY).toBe("")
  })

  it("STRIPE_WEBHOOK_SECRET defaults to empty string", () => {
    const result = envSchema.parse({})
    expect(result.STRIPE_WEBHOOK_SECRET).toBe("")
  })

  it("RESEND_AUDIENCE_ID defaults to empty string", () => {
    const result = envSchema.parse({})
    expect(result.RESEND_AUDIENCE_ID).toBe("")
  })

  it("RESEND_FROM_EMAIL defaults to Taxinator sender", () => {
    const result = envSchema.parse({})
    expect(result.RESEND_FROM_EMAIL).toBe("Taxinator <user@localhost>")
  })
})
