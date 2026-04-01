import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { resetFieldsAndCategories, resetLLMSettings } from "./actions"
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function DangerSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()
  const t = await getTranslations("settings")

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2 text-red-500">{t("dangerTitle")}</h1>
      <p className="text-sm text-red-400 mb-8 max-w-prose">
        {t("dangerDesc")}
      </p>
      <div className="space-y-10">
        <div className="space-y-2">
          <h3 className="text-lg font-bold">{t("llmSettingsTitle")}</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-prose">
            {t("llmSettingsResetDesc")}
          </p>
          <form
            action={async () => {
              "use server"
              await resetLLMSettings(user)
            }}
          >
            <Button variant="destructive" type="submit">
              {t("resetLlmPrompt")}
            </Button>
          </form>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold">{t("fieldsCurrenciesCategoriesTitle")}</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-prose">
            {t("fieldsCurrenciesCategoriesResetDesc")}
          </p>
          <form
            action={async () => {
              "use server"
              await resetFieldsAndCategories(user)
            }}
          >
            <Button variant="destructive" type="submit">
              {t("resetFieldsCurrenciesCategories")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
