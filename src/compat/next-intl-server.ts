import i18n from "../i18n"

/**
 * Compatibility shim for next-intl/server.
 *
 * Server-only functions that should never be called in the SPA.
 * Provided so that any accidental imports don't crash at module-load time.
 */

export function setRequestLocale(_locale: string) {
  // no-op in SPA — locale is set via i18next
}

export async function getTranslations(namespace: string) {
  return (key: string, options?: Record<string, unknown>) =>
    i18n.t(`${namespace}.${key}`, options)
}

export async function getLocale() {
  if (typeof window === "undefined") return "en"
  return localStorage.getItem("language") || "en"
}

export async function getMessages() {
  return {}
}
