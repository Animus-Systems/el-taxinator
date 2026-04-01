"use client"

import { useLocale } from "next-intl"
import { usePathname } from "@/lib/navigation"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()

  const nextLocale = locale === "en" ? "es" : "en"
  const flag = locale === "en" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F1EA}\u{1F1F8}"
  const label = locale === "en" ? "English" : "Español"

  // usePathname from next-intl returns path WITHOUT locale prefix
  // English (default) = no prefix, Spanish = /es prefix
  const href = nextLocale === "en" ? pathname : `/es${pathname}`

  return (
    <SidebarMenuButton asChild>
      <a href={href}>
        <span className="text-lg leading-none">{flag}</span>
        <span>{label}</span>
      </a>
    </SidebarMenuButton>
  )
}
