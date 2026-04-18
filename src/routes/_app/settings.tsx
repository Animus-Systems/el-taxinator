/**
 * Settings layout route — SPA equivalent of app/[locale]/(app)/settings/layout.tsx
 *
 * Renders the settings side navigation and an Outlet for child routes.
 */
import { Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { SideNav } from "@/components/settings/side-nav"
import { Separator } from "@/components/ui/separator"

export function SettingsLayout() {
  const { t } = useTranslation("settings")

  const settingsCategories = [
    { title: t("general"), href: "/settings" },
    { title: t("entities"), href: "/settings/entities" },
    { title: t("business"), href: "/settings/business" },
    { title: t("llm"), href: "/settings/llm" },
    { title: t("fields"), href: "/settings/fields" },
    { title: t("categories"), href: "/settings/categories" },
    { title: t("rules"), href: "/settings/rules" },
    { title: t("projects"), href: "/settings/projects" },
    { title: t("currencies"), href: "/settings/currencies" },
    { title: t("accounts"), href: "/settings/accounts" },
    { title: t("knowledgePacks", { defaultValue: "Knowledge packs" }), href: "/settings/knowledge" },
    { title: t("aiMemory", { defaultValue: "AI memory" }), href: "/settings/ai-memory" },
    { title: t("backups"), href: "/settings/backups" },
    { title: t("accountant"), href: "/settings/accountant" },
    { title: t("danger"), href: "/settings/danger" },
  ]

  return (
    <div className="space-y-6 p-10 pb-16">
      <div className="space-y-0.5">
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Separator className="my-6" />
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:w-1/5">
          <SideNav items={settingsCategories} />
        </aside>
        <div className="flex w-full">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
