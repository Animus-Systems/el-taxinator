/**
 * Entities settings page — SPA equivalent of app/[locale]/(app)/settings/entities/page.tsx
 *
 * The original called server-only getEntities() and getDataRoot().
 * In the SPA, the EntityManager and DataLocation are client components
 * that use compat shims (entities are read from the compat stub).
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { EntityManager } from "@/components/settings/entity-manager"
import { DataLocation } from "@/components/settings/data-location"
import { getEntities } from "@/lib/entities"

export function EntitiesSettingsPage() {
  const { t } = useTranslation("settings")

  const entities = getEntities()
  const { data: dataRoot } = trpc.entities.getDataRoot.useQuery()

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("companies")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("companiesDesc")}</p>
      <EntityManager entities={entities} />

      <h2 className="text-lg font-semibold mt-10 mb-2">{t("dataLocationTitle")}</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-prose">{t("dataLocationDesc")}</p>
      <DataLocation currentPath={dataRoot?.dataDir ?? ""} />
    </div>
  )
}
