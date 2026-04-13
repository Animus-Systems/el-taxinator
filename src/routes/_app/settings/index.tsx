/**
 * General settings page — SPA equivalent of app/[locale]/(app)/settings/page.tsx
 *
 * Loads settings, currencies, and categories via tRPC then renders
 * the existing GlobalSettingsForm client component.
 */
import { trpc } from "~/trpc"
import GlobalSettingsForm from "@/components/settings/global-settings-form"

export function SettingsIndexPage() {
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery({})
  const { data: currencies, isLoading: currenciesLoading } = trpc.currencies.list.useQuery({})
  const { data: categories, isLoading: categoriesLoading } = trpc.categories.list.useQuery({})

  if (settingsLoading || currenciesLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      <GlobalSettingsForm
        settings={settings ?? {}}
        currencies={currencies ?? []}
        categories={categories ?? []}
      />
    </div>
  )
}
