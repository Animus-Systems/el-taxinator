import { AccountantExport } from "@/components/settings/accountant-export"
import { getActiveEntity } from "@/lib/entities"
import { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "Data Export" }

export default async function AccountantSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("dataExport")
  const entity = await getActiveEntity()

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("description")}</p>
      <AccountantExport entityName={entity.name} entityType={entity.type} />
    </div>
  )
}
