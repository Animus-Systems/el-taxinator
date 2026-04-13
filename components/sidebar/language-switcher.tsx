
import { useTranslation } from "react-i18next"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const locale = i18n.language

  const nextLocale = locale === "en" ? "es" : "en"
  const flag = locale === "en" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F1EA}\u{1F1F8}"
  const label = locale === "en" ? "English" : "Español"

  const handleSwitch = () => {
    i18n.changeLanguage(nextLocale)
    localStorage.setItem("language", nextLocale)
  }

  return (
    <SidebarMenuButton onClick={handleSwitch}>
      <span className="text-lg leading-none">{flag}</span>
      <span>{label}</span>
    </SidebarMenuButton>
  )
}
