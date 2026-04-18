import enMessages from "@/messages/en.json"
import esMessages from "@/messages/es.json"
import { getLocalizedValue, i18n, type I18nValue } from "@/lib/i18n-db"

export type I18nRuleNameKey = "ruleNameForCategory" | "ruleLearnedPrefix"

type RawParamValue = string | I18nValue | null | undefined

const LOCALES = ["en", "es"] as const
type Locale = (typeof LOCALES)[number]

const templatesByLocale: Record<Locale, Record<I18nRuleNameKey, string>> = {
  en: {
    ruleNameForCategory: enMessages.settings.ruleNameForCategory,
    ruleLearnedPrefix: enMessages.settings.ruleLearnedPrefix,
  },
  es: {
    ruleNameForCategory: esMessages.settings.ruleNameForCategory,
    ruleLearnedPrefix: esMessages.settings.ruleLearnedPrefix,
  },
}

function interpolate(template: string, locale: Locale, params: Record<string, RawParamValue>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const raw = params[name]
    if (raw === null || raw === undefined) return ""
    return getLocalizedValue(raw, locale) || (typeof raw === "string" ? raw : "")
  })
}

/**
 * Build a JSON-encoded i18n rule name for auto-generated rules (import
 * "always apply" checkbox, learned rules). Plain-string params apply to both
 * locales; i18n-shaped params are resolved per-locale.
 *
 * Returns a string that `getLocalizedValue` will resolve to the right locale
 * at render time. Matches the storage pattern used by `categorySchema.name`.
 */
export function buildI18nRuleName(
  key: I18nRuleNameKey,
  params: Record<string, RawParamValue>,
): string {
  const en = interpolate(templatesByLocale.en[key], "en", params)
  const es = interpolate(templatesByLocale.es[key], "es", params)
  return i18n(en, es)
}
