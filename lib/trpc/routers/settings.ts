import { z } from "zod"
import { router, authedProcedure } from "../init"
import { getSettings, updateSettings, getLLMSettings } from "@/models/settings"
import { settingSchema, type Setting } from "@/lib/db-types"

const llmProviderSchema = z.object({
  provider: z.string(),
  apiKey: z.string(),
  model: z.string(),
  thinking: z.string().optional(),
})

const llmSettingsSchema = z.object({
  providers: z.array(llmProviderSchema),
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
      return getLLMSettings(settings)
    }),
})
