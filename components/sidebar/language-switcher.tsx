"use client"

import { useLocale } from "next-intl"
import { usePathname } from "@/lib/navigation"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()

  const nextLocale = locale === "en" ? "es" : "en"
  // Show the CURRENT language — clicking switches to the other
  const flag = locale === "en" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F1EA}\u{1F1F8}"
  const label = locale === "en" ? "English" : "Español"

  // Always include explicit locale prefix so the middleware updates the
  // NEXT_LOCALE cookie. Without the prefix, the middleware keeps the old locale.
  const href = `/${nextLocale}${pathname}`

  return (
    <SidebarMenuButton asChild>
      <a href={href}>
        <span className="text-lg leading-none">{flag}</span>
        <span>{label}</span>
      </a>
    </SidebarMenuButton>
  )
}
