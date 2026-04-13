import { routing } from "./routing"

// Re-export from routing for backward compatibility
export const locales = routing.locales
export type Locale = (typeof locales)[number]
export const defaultLocale = routing.defaultLocale
