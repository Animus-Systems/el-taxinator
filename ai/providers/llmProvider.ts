import { ChatOpenAI } from "@langchain/openai"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatMistralAI } from "@langchain/mistralai"
import { HumanMessage } from "@langchain/core/messages"
import { execFileSync } from "node:child_process"
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PROVIDERS } from "@/lib/llm-providers"
import { parseLLMJson } from "./parse-json"

export type LLMProvider = (typeof PROVIDERS)[number]["key"]

export interface LLMAttachment {
  base64: string
  contentType: string
}

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  /** True when `model` fell back to the provider's default because the user
   *  hasn't set one explicitly. Used only for log clarity. */
  modelIsDefault?: boolean
  thinking?: string
  baseUrl?: string
}

export interface LLMSettings {
  providers: LLMConfig[]
}

export interface LLMRequest {
  prompt: string
  schema?: Record<string, unknown>
  attachments?: LLMAttachment[]
}

export interface LLMResponse {
  output: Record<string, unknown>
  tokensUsed?: number
  provider: LLMProvider
  error?: string
}

const subscriptionProviders = new Set(
  PROVIDERS.filter((p) => p.isSubscription).map((p) => p.key)
)

interface CLISpec {
  binary: string
  buildArgs: (prompt: string, model: string, hasAttachments: boolean) => string[]
  useStdin: boolean
}

const CLI_SPECS: Record<string, CLISpec> = {
  anthropic: {
    binary: "claude",
    buildArgs: (_, model, hasAttachments) => {
      const args = ["-p", "", "--output-format", "text"]
      // Only enable the Read tool when we're feeding image temp files.
      // Without attachments, granting tools puts Claude into agent mode and
      // can blow past the 120s budget on big prompts.
      if (hasAttachments) args.push("--allowedTools", "Read")
      if (model) args.push("--model", model)
      return args
    },
    useStdin: false,
  },
  codex: {
    binary: "codex",
    buildArgs: (_, model) => {
      const args = ["exec", "--json"]
      if (model) args.push("--model", model)
      args.push("-")
      return args
    },
    useStdin: true,
  },
}

async function requestCLI(config: LLMConfig, req: LLMRequest, timeoutMs?: number): Promise<LLMResponse> {
  const spec = CLI_SPECS[config.provider]
  if (!spec) {
    return { output: {}, provider: config.provider, error: `No CLI spec for provider: ${config.provider}` }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), `taxinator-${config.provider}-`))
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
      parts.push("", "Analyze the following image files:")
      for (const p of imagePaths) parts.push(`- ${p}`)
    }

    if (config.thinking === "high") {
      parts.push("", "Think step by step and be very thorough in your analysis. Double-check all amounts and dates.")
    }

    if (req.schema) {
      parts.push(
        "",
        "IMPORTANT: Respond with ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation — just the JSON object:",
        JSON.stringify(req.schema, null, 2)
      )
    }

    const hasAttachments = (req.attachments?.length ?? 0) > 0
    const fullPrompt = parts.join("\n")
    const args = spec.buildArgs(fullPrompt, config.model || "", hasAttachments)

    if (!spec.useStdin) {
      args[1] = fullPrompt
    }

    const effectiveTimeout = timeoutMs ?? (hasAttachments ? 300_000 : 240_000)

    const approxTokens = Math.ceil(fullPrompt.length / 4)
    const modelSource = config.model
      ? config.modelIsDefault
        ? `${config.model} (default)`
        : config.model
      : "default"
    console.info(
      `[llm] ${spec.binary} CLI → model=${modelSource}${config.thinking ? ` thinking=${config.thinking}` : ""} timeout=${effectiveTimeout / 1000}s prompt=${fullPrompt.length}ch (~${approxTokens}tok)${hasAttachments ? ` attachments=${req.attachments?.length}` : ""}`,
    )

    const startedAt = Date.now()
    const result = execFileSync(spec.binary, args, {
      timeout: effectiveTimeout,
      encoding: "utf-8",
      env: process.env as NodeJS.ProcessEnv,
      input: spec.useStdin ? fullPrompt : undefined,
    })
    const durationMs = Date.now() - startedAt

    const requiredKeys = extractRequiredKeys(req.schema)
    const parsed = parseLLMJson(result, { requiredKeys })
    if (!parsed) {
      console.warn(
        `[llm] ${spec.binary} returned unparsable output after ${durationMs}ms (${result.length}ch). Snippet: ${truncateForLog(result, 300)}`,
      )
      return {
        output: {},
        provider: config.provider,
        error: `CLI returned no parsable JSON. Output: ${truncateForLog(result, 500)}`,
      }
    }

    const missing = requiredKeys.filter((k) => !(k in parsed))
    if (missing.length > 0) {
      console.warn(
        `[llm] ${spec.binary} parsed JSON is missing required keys [${missing.join(", ")}]. Found keys: [${Object.keys(parsed).join(", ")}]. Raw snippet: ${truncateForLog(result, 300)}`,
      )
      return {
        output: {},
        provider: config.provider,
        error: `CLI returned JSON missing required fields: [${missing.join(", ")}]. Try a different provider or tell the model to return exactly the schema.`,
      }
    }

    console.info(
      `[llm] ${spec.binary} ok in ${durationMs}ms → ${Object.keys(parsed).length} keys`,
    )
    return { output: parsed, provider: config.provider }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `${spec.binary} CLI failed`
    return { output: {}, provider: config.provider, error: message }
  } finally {
    for (const p of imagePaths) {
      try { unlinkSync(p) } catch {}
    }
    try { rmSync(tmpDir, { recursive: true }) } catch {}
  }
}

async function requestLLMUnified(config: LLMConfig, req: LLMRequest, timeoutMs?: number): Promise<LLMResponse> {
  try {
    if (subscriptionProviders.has(config.provider)) {
      return await requestCLI(config, req, timeoutMs)
    }

    let model: ReturnType<typeof ChatOpenAI.prototype.withStructuredOutput> extends infer T ? T : never
    const temperature = 0

    if (config.provider === "openai") {
      model = new ChatOpenAI({ apiKey: config.apiKey, model: config.model, temperature })
    } else if (config.provider === "openrouter") {
      model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
      })
    } else if (config.provider === "custom") {
      if (!config.baseUrl) {
        return { output: {}, provider: config.provider, error: "Custom provider requires a base URL" }
      }
      model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature,
        configuration: { baseURL: config.baseUrl },
      })
    } else if (config.provider === "google") {
      model = new ChatGoogleGenerativeAI({ apiKey: config.apiKey, model: config.model, temperature })
    } else if (config.provider === "mistral") {
      model = new ChatMistralAI({ apiKey: config.apiKey, model: config.model, temperature })
    } else {
      return { output: {}, provider: config.provider, error: "Unknown provider" }
    }

    const structuredModel = (model as ReturnType<typeof ChatOpenAI.prototype.withStructuredOutput> & { withStructuredOutput: Function }).withStructuredOutput(req.schema, { name: "transaction" })

    const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: req.prompt },
    ]
    if (req.attachments && req.attachments.length > 0) {
      for (const att of req.attachments) {
        messageContent.push({
          type: "image_url",
          image_url: { url: `data:${att.contentType};base64,${att.base64}` },
        })
      }
    }

    const response = await structuredModel.invoke([new HumanMessage({ content: messageContent })])
    return { output: response as Record<string, unknown>, provider: config.provider }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : `${config.provider} request failed`
    return { output: {}, provider: config.provider, error: message }
  }
}

export async function requestLLM(settings: LLMSettings, req: LLMRequest, timeoutMs?: number): Promise<LLMResponse> {
  const eligibleCount = settings.providers.filter(
    (p) => p.model && (subscriptionProviders.has(p.provider) || p.apiKey),
  ).length
  let tried = 0

  for (const config of settings.providers) {
    const isSubscription = subscriptionProviders.has(config.provider)
    if (!config.model) {
      console.info(`[llm] skip ${config.provider} (no model configured)`)
      continue
    }
    if (!isSubscription && !config.apiKey) {
      console.info(`[llm] skip ${config.provider} (no API key)`)
      continue
    }

    tried += 1
    console.info(
      `[llm] try ${config.provider} (${isSubscription ? "subscription" : "API key"}) — attempt ${tried}/${eligibleCount}`,
    )

    const response = await requestLLMUnified(config, req, timeoutMs)
    if (!response.error) {
      console.info(`[llm] ✓ ${config.provider} succeeded`)
      return response
    }
    console.error(`[llm] ✗ ${config.provider} failed: ${response.error}`)
  }

  return {
    output: {},
    provider: settings.providers[0]?.provider || ("openai" as LLMProvider),
    error: "All LLM providers failed or are not configured",
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRequiredKeys(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || typeof schema !== "object") return []
  const required = (schema as { required?: unknown }).required
  if (!Array.isArray(required)) return []
  return required.filter((k): k is string => typeof k === "string")
}

function truncateForLog(text: string, limit: number): string {
  if (text.length <= limit) return text
  return text.slice(0, limit) + `… (+${text.length - limit} chars elided)`
}
