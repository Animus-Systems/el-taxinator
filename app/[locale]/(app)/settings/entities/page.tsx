import { EntityManager } from "@/components/settings/entity-manager"
import { DataLocation } from "@/components/settings/data-location"
import { getEntities } from "@/lib/entities"
import { getDataRoot } from "@/lib/embedded-pg"
import { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "Entities" }

export default async function EntitiesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const entities = getEntities()
  const dataRoot = getDataRoot()

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("companies")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("companiesDesc")}</p>
      <EntityManager entities={entities} />

      <h2 className="text-lg font-semibold mt-10 mb-2">{t("dataLocationTitle")}</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-prose">{t("dataLocationDesc")}</p>
      <DataLocation currentPath={dataRoot} />
    </div>
  )
}
