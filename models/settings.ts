import { sql, queryMany, queryOne } from "@/lib/sql"
import { PROVIDERS } from "@/lib/llm-providers"
import type { Setting } from "@/lib/db-types"
import { cache } from "react"
import type { LLMConfig, LLMProvider, LLMSettings } from "@/ai/providers/llmProvider"

export type SettingsMap = Record<string, string>

const readSetting = (settings: SettingsMap, key: string): string => settings[key] ?? ""

/**
 * Helper to extract LLM provider settings from SettingsMap.
 * Respects llm_primary_provider for quick-switching, with llm_providers as fallback order.
 */
export function getLLMSettings(settings: SettingsMap): LLMSettings {
  const primaryProvider = readSetting(settings, "llm_primary_provider")
  const backupProvider = readSetting(settings, "llm_backup_provider")
  const fallbackRaw = readSetting(settings, "llm_providers") || PROVIDERS.map(p => p.key).join(",")
  const fallbackOrder = fallbackRaw.split(",").map(p => p.trim()).filter(Boolean)

  // Build ordered list: primary first, backup second, then remaining fallback order
  const seen = new Set<string>()
  const orderedKeys: string[] = []
  if (primaryProvider) { orderedKeys.push(primaryProvider); seen.add(primaryProvider) }
  if (backupProvider && !seen.has(backupProvider)) { orderedKeys.push(backupProvider); seen.add(backupProvider) }
  for (const k of fallbackOrder) { if (!seen.has(k)) { orderedKeys.push(k); seen.add(k) } }

  const providers = orderedKeys.flatMap<LLMConfig>((providerKey) => {
    const providerMeta = PROVIDERS.find(p => p.key === providerKey)
    if (!providerMeta) return []

    const userSetModel = readSetting(settings, providerMeta.modelName)
    const model = userSetModel || providerMeta.defaultModelName
    const thinking = providerMeta.thinkingSettingName
      ? (readSetting(settings, providerMeta.thinkingSettingName) || "medium")
      : undefined
    const baseUrl = providerMeta.baseUrlName
      ? (readSetting(settings, providerMeta.baseUrlName) || undefined)
      : undefined

    const config: LLMConfig = {
      provider: providerKey as LLMProvider,
      apiKey: readSetting(settings, providerMeta.apiKeyName),
      model,
      modelIsDefault: !userSetModel,
    }
    if (thinking !== undefined) config.thinking = thinking
    if (baseUrl !== undefined) config.baseUrl = baseUrl
    return [config]
  })

  return { providers }
}

/**
 * Swap Anthropic Opus models to Sonnet for vision/extraction tasks.
 *
 * Opus (4.7 specifically) is agentic by design — when invoked via the Claude
 * CLI's `-p` mode with `--allowedTools Read`, it sometimes decides NOT to
 * call the Read tool on the attached file and returns an empty result.
 * Measured reliability on a 2-page BBVA statement: Sonnet 4.6 ≈ 100%,
 * Opus 4.7 ≈ 33%. For structured vision extraction — "read file, emit JSON" —
 * Sonnet is the right tool. Users who picked Opus as primary still get Opus
 * for wizard chat and reasoning, where its agentic behavior is an asset.
 */
export function preferSonnetForVision(settings: LLMSettings): LLMSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => {
      if (p.provider !== "anthropic") return p
      if (!p.model.startsWith("claude-opus")) return p
      return { ...p, model: "claude-sonnet-4-6", modelIsDefault: false }
    }),
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
