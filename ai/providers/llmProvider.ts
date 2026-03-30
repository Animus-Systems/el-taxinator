import { ChatOpenAI } from "@langchain/openai"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatMistralAI } from "@langchain/mistralai"
import { BaseMessage, HumanMessage } from "@langchain/core/messages"
import { execFileSync } from "node:child_process"
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type LLMProvider = "openai" | "google" | "mistral" | "anthropic" | "codex"

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  thinking?: string
}

export interface LLMSettings {
  providers: LLMConfig[]
}

export interface LLMRequest {
  prompt: string
  schema?: Record<string, unknown>
  attachments?: any[]
}

export interface LLMResponse {
  output: Record<string, string>
  tokensUsed?: number
  provider: LLMProvider
  error?: string
}

/**
 * Anthropic provider via Claude CLI (uses subscription auth, no API key needed).
 * Falls back to LangChain SDK if an API key is provided.
 */
async function requestAnthropicCLI(config: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  const tmpDir = mkdtempSync(join(tmpdir(), "taxhacker-"))
  const imagePaths: string[] = []

  try {
    // Save attachments to temp files so Claude CLI can read them
    for (const att of req.attachments || []) {
      const ext = (att.contentType || "image/png").split("/")[1] || "png"
      const tmpFile = join(tmpDir, `receipt-${imagePaths.length}.${ext}`)
      writeFileSync(tmpFile, Buffer.from(att.base64, "base64"))
      imagePaths.push(tmpFile)
    }

    // Build prompt: include image paths for Claude to read + schema for structured output
    const parts: string[] = [req.prompt]

    if (imagePaths.length > 0) {
      parts.push("")
      parts.push("Analyze the following image files:")
      for (const p of imagePaths) {
        parts.push(`- ${p}`)
      }
    }

    if (req.schema) {
      parts.push("")
      parts.push("IMPORTANT: Respond with ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation — just the JSON object:")
      parts.push(JSON.stringify(req.schema, null, 2))
    }

    // Add thinking instruction based on effort level
    if (config.thinking === "high") {
      parts.push("\nThink step by step and be very thorough in your analysis. Double-check all amounts and dates.")
    }

    const fullPrompt = parts.join("\n")

    const args = [
      "-p", fullPrompt,
      "--output-format", "text",
      "--allowedTools", "Read",
    ]
    if (config.model) {
      args.push("--model", config.model)
    }

    console.info(`Running Claude CLI (model: ${config.model || "default"}, thinking: ${config.thinking || "medium"})...`)

    const result = execFileSync("claude", args, {
      timeout: 120_000,
      encoding: "utf-8",
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    })

    // Extract JSON from response (Claude may include surrounding text)
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        output: {},
        provider: "anthropic",
        error: `Claude CLI returned no JSON. Output: ${result.substring(0, 500)}`,
      }
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      output: parsed,
      provider: "anthropic",
    }
  } finally {
    // Cleanup temp files
    for (const p of imagePaths) {
      try { unlinkSync(p) } catch {}
    }
    try { unlinkSync(tmpDir) } catch {}
  }
}

/**
 * Codex CLI provider (uses Codex subscription auth).
 */
async function requestCodexCLI(config: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  const tmpDir = mkdtempSync(join(tmpdir(), "taxinator-codex-"))
  const imagePaths: string[] = []

  try {
    for (const att of req.attachments || []) {
      const ext = (att.contentType || "image/png").split("/")[1] || "png"
      const tmpFile = join(tmpDir, `receipt-${imagePaths.length}.${ext}`)
      writeFileSync(tmpFile, Buffer.from(att.base64, "base64"))
      imagePaths.push(tmpFile)
    }

    const parts: string[] = [req.prompt]

    if (imagePaths.length > 0) {
      parts.push("")
      parts.push("Analyze the following image files:")
      for (const p of imagePaths) {
        parts.push(`- ${p}`)
      }
    }

    if (req.schema) {
      parts.push("")
      parts.push("IMPORTANT: Respond with ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation — just the JSON object:")
      parts.push(JSON.stringify(req.schema, null, 2))
    }

    const fullPrompt = parts.join("\n")

    const args = ["exec", "--json", "-"]
    if (config.model) {
      args.splice(2, 0, "--model", config.model)
    }

    console.info(`Running Codex CLI (model: ${config.model || "default"})...`)

    const result = execFileSync("codex", args, {
      timeout: 120_000,
      encoding: "utf-8",
      input: fullPrompt,
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    })

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        output: {},
        provider: "codex",
        error: `Codex CLI returned no JSON. Output: ${result.substring(0, 500)}`,
      }
    }

    return {
      output: JSON.parse(jsonMatch[0]),
      provider: "codex",
    }
  } catch (err: any) {
    return {
      output: {},
      provider: "codex",
      error: err instanceof Error ? err.message : "Codex CLI failed",
    }
  } finally {
    for (const p of imagePaths) {
      try { unlinkSync(p) } catch {}
    }
    try { unlinkSync(tmpDir) } catch {}
  }
}

async function requestLLMUnified(config: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  try {
    // Subscription providers: use CLI (no API key needed)
    if (config.provider === "anthropic") {
      return await requestAnthropicCLI(config, req)
    }
    if (config.provider === "codex") {
      return await requestCodexCLI(config, req)
    }

    const temperature = 0
    let model: any
    if (config.provider === "openai") {
      model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else if (config.provider === "google") {
      model = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else if (config.provider === "mistral") {
      model = new ChatMistralAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else {
      return {
        output: {},
        provider: config.provider,
        error: "Unknown provider",
      }
    }

    const structuredModel = model.withStructuredOutput(req.schema, { name: "transaction" })

    let message_content: any = [{ type: "text", text: req.prompt }]
    if (req.attachments && req.attachments.length > 0) {
      const images = req.attachments.map((att) => ({
        type: "image_url",
        image_url: {
          url: `data:${att.contentType};base64,${att.base64}`,
        },
      }))
      message_content.push(...images)
    }
    const messages: BaseMessage[] = [new HumanMessage({ content: message_content })]

    const response = await structuredModel.invoke(messages)

    return {
      output: response,
      provider: config.provider,
    }
  } catch (error: any) {
    return {
      output: {},
      provider: config.provider,
      error: error instanceof Error ? error.message : `${config.provider} request failed`,
    }
  }
}

export async function requestLLM(settings: LLMSettings, req: LLMRequest): Promise<LLMResponse> {
  const subscriptionProviders = new Set(["anthropic", "codex"])

  for (const config of settings.providers) {
    const isSubscription = subscriptionProviders.has(config.provider)
    // Subscription providers only need a model, not an API key
    if (isSubscription && !config.model) {
      console.info("Skipping provider (no model):", config.provider)
      continue
    }
    if (!isSubscription && (!config.apiKey || !config.model)) {
      console.info("Skipping provider (no key/model):", config.provider)
      continue
    }
    console.info("Use provider:", config.provider, isSubscription ? "(subscription)" : "(API key)")

    const response = await requestLLMUnified(config, req)

    if (!response.error) {
      return response
    } else {
      console.error(response.error)
    }
  }

  return {
    output: {},
    provider: settings.providers[0]?.provider || "openai",
    error: "All LLM providers failed or are not configured",
  }
}
