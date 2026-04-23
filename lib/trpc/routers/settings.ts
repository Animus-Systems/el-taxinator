import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { getSettings, updateSettings, getLLMSettings } from "@/models/settings"
import { settingSchema, type Setting } from "@/lib/db-types"
import { PROVIDERS } from "@/lib/llm-providers"
import { testLLMProvider } from "@/ai/providers/llmProvider"
import type { LLMProvider } from "@/ai/providers/llmProvider"
import { checkFastifyRateLimit } from "@/server/rate-limit-adapter"

const SETTING_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/
const settingCodeSchema = z.string().regex(SETTING_CODE_RE, "invalid setting code")
const settingValueSchema = z.string().max(10_000).optional()

const llmHintItemSchema = z.object({
  provider: z.string(),
  model: z.string(),
  thinking: z.string().nullable(),
  modelIsDefault: z.boolean(),
  isSubscription: z.boolean(),
})

const llmHintSchema = z.object({
  eligible: z.array(llmHintItemSchema),
})

export const settingsRouter = router({
  get: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/settings" } })
    .input(z.object({}))
    .output(z.record(z.string(), z.string()))
    .query(async ({ ctx }) => {
      return getSettings(ctx.user.id)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/settings" } })
    .input(z.record(settingCodeSchema, settingValueSchema))
    .output(z.record(z.string(), settingSchema.nullable()))
    .mutation(async ({ ctx, input }) => {
      if (ctx.req) {
        const rl = checkFastifyRateLimit(ctx.req, {
          windowMs: 60_000,
          maxRequests: 60,
          keyPrefix: "settings:update:",
        })
        if (!rl.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many settings updates",
          })
        }
      }
      const results: Record<string, Setting | null> = {}
      for (const [code, value] of Object.entries(input)) {
        results[code] = await updateSettings(ctx.user.id, code, value) ?? null
      }
      return results
    }),

  testProvider: authedProcedure
    .input(z.object({
      provider: z.string(),
      apiKey: z.string(),
      model: z.string(),
      thinking: z.string().optional(),
      baseUrl: z.string().optional(),
    }))
    .output(z.object({
      success: z.boolean(),
      error: z.string().optional(),
      responseTime: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return testLLMProvider({
        provider: input.provider as LLMProvider,
        apiKey: input.apiKey,
        model: input.model,
        ...(input.thinking !== undefined && { thinking: input.thinking }),
        ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl }),
      })
    }),

  getActiveLLMHint: authedProcedure
    .input(z.object({}))
    .output(llmHintSchema)
    .query(async ({ ctx }) => {
      const settings = await getSettings(ctx.user.id)
      const llm = getLLMSettings(settings)
      const subscriptionKeys = new Set(
        PROVIDERS.filter((p) => p.isSubscription).map((p) => p.key),
      )
      const eligible = llm.providers
        .filter((p) => p.model && (subscriptionKeys.has(p.provider) || p.apiKey))
        .map((p) => ({
          provider: p.provider,
          model: p.model,
          thinking: p.thinking ?? null,
          modelIsDefault: p.modelIsDefault ?? false,
          isSubscription: subscriptionKeys.has(p.provider),
        }))
      return { eligible }
    }),
})
