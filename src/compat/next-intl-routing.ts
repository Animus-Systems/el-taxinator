/**
 * Compatibility shim for next-intl/routing.
 *
 * In the SPA, routing is handled by TanStack Router.
 * This shim provides the defineRouting export that routing.ts uses.
 */

export function defineRouting(config: {
  locales: string[]
  defaultLocale: string
  localePrefix?: string
}) {
  return {
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    localePrefix: config.localePrefix || "as-needed",
  }
}
