"use client"

import { getLocalizedValue } from "@/lib/i18n-db"
import { useLocale } from "next-intl"

/**
 * Renders a database text value with locale awareness.
 * If the value is a JSON i18n object like {"en":"Name","es":"Nombre"},
 * it displays the value for the current locale.
 * If it's a plain string, it renders as-is.
 */
export function L({ children }: { children: string | Record<string, string> | null | undefined }) {
  const locale = useLocale()
  if (!children) return null
  return <>{getLocalizedValue(children, locale)}</>
}
