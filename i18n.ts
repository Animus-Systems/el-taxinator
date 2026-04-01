import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

// Re-export from routing for backward compatibility
export const locales = routing.locales
export type Locale = (typeof locales)[number]
export const defaultLocale = routing.defaultLocale

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  // Validate that the locale is supported
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
