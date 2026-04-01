import { EntityManager } from "@/components/settings/entity-manager"
import { getEntities } from "@/lib/entities"
import { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "Entities" }

export default async function EntitiesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const entities = getEntities()

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("companies")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("companiesDesc")}</p>
      <EntityManager entities={entities} />
    </div>
  )
}
