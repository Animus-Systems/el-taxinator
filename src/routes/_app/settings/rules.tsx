/**
 * Rules settings page — SPA equivalent of app/[locale]/(app)/settings/rules/page.tsx
 *
 * Loads rules, categories, and projects via tRPC and renders the RulesPage component.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { RulesPage } from "@/components/settings/rules-page"

export function RulesSettingsPage() {
  const { t } = useTranslation("settings")

  const { data: rules, isLoading: rulesLoading } = trpc.rules.list.useQuery({})
  const { data: categories, isLoading: categoriesLoading } = trpc.categories.list.useQuery({})
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery({})

  if (rulesLoading || categoriesLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("rules")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">{t("rulesDesc")}</p>
      <RulesPage
        rules={rules ?? []}
        categories={categories ?? []}
        projects={projects ?? []}
      />
    </div>
  )
}
