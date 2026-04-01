/**
 * Locale-aware database text values.
 *
 * Values can be stored as:
 * - Plain string: "Advertisement" (legacy, treated as default locale)
 * - JSON object: {"en": "Advertisement", "es": "Publicidad"}
 *
 * This module provides helpers to read/write these values.
 */

export type I18nValue = Record<string, string>

/**
 * Extract the value for a given locale from a potentially i18n field.
 * Falls back to: requested locale → default locale → any available locale → raw string.
 */
export function getLocalizedValue(value: unknown, locale: string, defaultLocale: string = "en"): string {
  if (!value) return ""

  // Already a parsed object (mapRow auto-parses JSON strings into objects)
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, string>
    return obj[locale] ?? obj[defaultLocale] ?? Object.values(obj)[0] ?? ""
  }

  if (typeof value !== "string") return String(value)

  // Try to parse as JSON i18n string
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as I18nValue
      return parsed[locale] ?? parsed[defaultLocale] ?? Object.values(parsed)[0] ?? ""
    } catch {
      // Not valid JSON — treat as plain string
    }
  }

  return value
}

/**
 * Create an i18n value object from a string and locale.
 * If existingValue already has i18n data, merges the new value in.
 */
export function setLocalizedValue(existingValue: string | null | undefined, newValue: string, locale: string): string {
  let obj: I18nValue = {}

  // Try to parse existing value as i18n object
  if (existingValue && existingValue.startsWith("{")) {
    try {
      obj = JSON.parse(existingValue) as I18nValue
    } catch {}
  } else if (existingValue) {
    // Existing plain string — assume it's the default locale
    obj = { en: existingValue }
  }

  obj[locale] = newValue
  return JSON.stringify(obj)
}

/**
 * Check if a value is an i18n JSON object (has multiple locales).
 */
export function isI18nValue(value: string | null | undefined): boolean {
  if (!value || !value.startsWith("{")) return false
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Create an i18n value from EN and ES strings.
 */
export function i18n(en: string, es: string): string {
  return JSON.stringify({ en, es })
}
