/**
 * AI Import settings page — SPA equivalent of app/[locale]/(app)/settings/import/page.tsx
 *
 * Loads active accounts and renders the ImportUpload component.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { ImportUpload } from "@/components/import/import-upload"

export function ImportSettingsPage() {
  const { t } = useTranslation("settings")

  const { data: accounts, isLoading } = trpc.accounts.listActive.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">{t("aiImportTitle")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">
        {t("aiImportDesc")}
      </p>
      <ImportUpload accounts={accounts ?? []} />
    </div>
  )
}
