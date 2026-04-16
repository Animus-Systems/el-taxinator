/**
 * Accountant/Data Export settings page — SPA equivalent of
 * app/[locale]/(app)/settings/accountant/page.tsx
 *
 * The original called getActiveEntity() server-side.
 * In the SPA we read the entity from cookie / compat shim.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { AccountantExport } from "@/components/settings/accountant-export"
import type { EntityType } from "@/lib/entities"

export function AccountantSettingsPage() {
  const { t } = useTranslation("dataExport")

  // Settings includes entity info we can use
  const { data: settings, isLoading } = trpc.settings.get.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Entity name/type would come from entity context; use defaults for now
  const s = (settings ?? {}) as Record<string, unknown>
  const entityName = (s["entity_name"] as string) || ""
  const entityType = ((s["entity_type"] as string) || "autonomo") as EntityType

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("description")}</p>
      <AccountantExport entityName={entityName} entityType={entityType} />
    </div>
  )
}
