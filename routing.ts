/**
 * Routing configuration for i18n.
 *
 * Previously used next-intl/routing. Now implemented inline since Next.js
 * has been removed. The compat shim at src/compat/next-intl-routing.ts
 * mirrors this interface for Vite builds.
 */

export type RoutingConfig = {
  locales: string[]
  defaultLocale: string
  localePrefix: string
}

function defineRouting(config: {
  locales: string[]
  defaultLocale: string
  localePrefix?: string
}): RoutingConfig {
  return {
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    localePrefix: config.localePrefix ?? "as-needed",
  }
}

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed",
})
