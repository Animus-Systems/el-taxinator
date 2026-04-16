import { getLLMSettings } from "@/models/settings"
import { getSettings } from "@/models/settings"
import { requestLLM } from "@/ai/providers/llmProvider"
import { isI18nValue, setLocalizedValue } from "./i18n-db"

/**
 * Auto-translate a text value to the missing locale using AI.
 * If the value already has both locales, returns it unchanged.
 * If AI is not configured or fails, returns the value with just the provided locale.
 */
export async function autoTranslate(
  value: string,
  currentLocale: string,
  userId: string,
): Promise<string> {
  const targetLocale = currentLocale === "en" ? "es" : "en"

  // If already has both locales, skip
  if (isI18nValue(value)) {
    const existing = JSON.parse(value)
    if (existing[targetLocale]) return value
  }

  // Build i18n value with current locale
  let i18nValue = setLocalizedValue(null, value, currentLocale)

  // Try AI translation
  try {
    const settings = await getSettings(userId)
    const llmSettings = getLLMSettings(settings)

    if (llmSettings.providers.length === 0) return i18nValue

    const targetLang = targetLocale === "es" ? "Spanish" : "English"
    const response = await requestLLM(llmSettings, {
      prompt: `Translate the following text to ${targetLang}. Return ONLY the translation, nothing else:\n\n${value}`,
    })

    if (!response.error && response.output) {
      const translated = typeof response.output === "string"
        ? response.output
        : (response.output as Record<string, unknown>)["translation"] as string ?? JSON.stringify(response.output)
      if (translated) {
        i18nValue = setLocalizedValue(i18nValue, translated.trim(), targetLocale)
      }
    }
  } catch {
    // AI not available — return with just the current locale
  }

  return i18nValue
}
