import { z } from "zod"
import { router, authedProcedure } from "../init"
import { getSettings, updateSettings, getLLMSettings } from "@/models/settings"
import { settingSchema, type Setting } from "@/lib/db-types"
import { PROVIDERS } from "@/lib/llm-providers"
import { testLLMProvider } from "@/ai/providers/llmProvider"
import type { LLMProvider } from "@/ai/providers/llmProvider"

const llmProviderSchema = z.object({
  provider: z.string(),
  apiKey: z.string(),
  model: z.string(),
  thinking: z.string().optional(),
})

const llmSettingsSchema = z.object({
  providers: z.array(llmProviderSchema),
})

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
    .input(z.record(z.string(), z.string().optional()))
    .output(z.record(z.string(), settingSchema.nullable()))
    .mutation(async ({ ctx, input }) => {
      const results: Record<string, Setting | null> = {}
      for (const [code, value] of Object.entries(input)) {
        results[code] = await updateSettings(ctx.user.id, code, value) ?? null
      }
      return results
    }),

  getLLM: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/settings/llm" } })
    .input(z.object({}))
    .output(llmSettingsSchema)
    .query(async ({ ctx }) => {
      const settings = await getSettings(ctx.user.id)
      const llm = getLLMSettings(settings)
      return {
        providers: llm.providers.map((p) => ({
          provider: p.provider,
          apiKey: p.apiKey,
          model: p.model,
          ...(p.thinking !== undefined && { thinking: p.thinking }),
        })),
      }
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
