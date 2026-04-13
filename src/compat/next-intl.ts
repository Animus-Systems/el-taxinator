/**
 * Compatibility shim for next-intl.
 *
 * Re-exports the hooks that existing client components import from "next-intl"
 * so they work unchanged in the Vite SPA.
 */
export { useTranslations } from "./translations"

export function useLocale(): string {
  const stored = localStorage.getItem("language")
  return stored || "en"
}

export function useFormatter() {
  return {
    number: (n: number, opts?: Intl.NumberFormatOptions) =>
      n.toLocaleString(undefined, opts),
    dateTime: (d: Date, opts?: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString(undefined, opts),
  }
}

// Re-export useTranslations as useMessages for any component that uses it
export function useMessages() {
  return {}
}

export function useNow() {
  return new Date()
}

export function useTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
