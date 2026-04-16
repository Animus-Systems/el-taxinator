import { useTranslation } from "react-i18next"
import { PersonalTaxSection } from "@/components/personal/personal-tax-section"

export function PersonalIndexPage() {
  const { t } = useTranslation("tax")
  const year = new Date().getFullYear()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("personal.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("personal.indexSubtitle")}</p>
      </header>
      <PersonalTaxSection year={year} />
    </div>
  )
}
