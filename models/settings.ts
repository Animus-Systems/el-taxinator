import { sql, queryMany, queryOne } from "@/lib/sql"
import { PROVIDERS } from "@/lib/llm-providers"
import type { Setting } from "@/lib/db-types"
import { cache } from "react"
import { LLMProvider } from "@/ai/providers/llmProvider"

export type SettingsMap = Record<string, string>

/**
 * Helper to extract LLM provider settings from SettingsMap.
 * Respects llm_primary_provider for quick-switching, with llm_providers as fallback order.
 */
export function getLLMSettings(settings: SettingsMap) {
  const primaryProvider = settings.llm_primary_provider || ""
  const backupProvider = settings.llm_backup_provider || ""
  const fallbackOrder = (settings.llm_providers || PROVIDERS.map(p => p.key).join(","))
    .split(",").map(p => p.trim()).filter(Boolean)

  // Build ordered list: primary first, backup second, then remaining fallback order
  const seen = new Set<string>()
  const orderedKeys: string[] = []
  if (primaryProvider) { orderedKeys.push(primaryProvider); seen.add(primaryProvider) }
  if (backupProvider && !seen.has(backupProvider)) { orderedKeys.push(backupProvider); seen.add(backupProvider) }
  for (const k of fallbackOrder) { if (!seen.has(k)) { orderedKeys.push(k); seen.add(k) } }

  const providers = orderedKeys.map((providerKey) => {
    const providerMeta = PROVIDERS.find(p => p.key === providerKey)
    if (!providerMeta) return null

    return {
      provider: providerKey as LLMProvider,
      apiKey: settings[providerMeta.apiKeyName] || "",
      model: settings[providerMeta.modelName] || providerMeta.defaultModelName,
      thinking: providerMeta.thinkingSettingName
        ? (settings[providerMeta.thinkingSettingName] || "medium")
        : undefined,
      baseUrl: providerMeta.baseUrlName
        ? (settings[providerMeta.baseUrlName] || undefined)
        : undefined,
    }
  }).filter((provider): provider is NonNullable<typeof provider> => provider !== null)

  return {
    providers,
  }
}

export const getSettings = cache(async (userId: string): Promise<SettingsMap> => {
  const settings = await queryMany<Setting>(
    sql`SELECT * FROM settings WHERE user_id = ${userId}`
  )

  return settings.reduce((acc, setting) => {
    acc[setting.code] = setting.value || ""
    return acc
  }, {} as SettingsMap)
})

export const updateSettings = async (userId: string, code: string, value: string | undefined) => {
  return await queryOne<Setting>(
    sql`INSERT INTO settings (user_id, code, name, value)
        VALUES (${userId}, ${code}, ${code}, ${value ?? null})
        ON CONFLICT (user_id, code)
        DO UPDATE SET value = ${value ?? null}
        RETURNING *`
  )
}
