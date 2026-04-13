/**
 * Danger zone settings page — SPA equivalent of app/[locale]/(app)/settings/danger/page.tsx
 *
 * The original used server actions (resetLLMSettings, resetFieldsAndCategories)
 * that hit the DB directly. In the SPA, we wire up tRPC mutations or
 * show placeholder buttons that will be connected later.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export function DangerSettingsPage() {
  const { t } = useTranslation("settings")

  const handleResetLLM = async () => {
    // TODO: Wire up tRPC mutation for resetting LLM settings
    if (window.confirm("Are you sure you want to reset LLM settings to defaults?")) {
      window.location.href = "/settings/llm"
    }
  }

  const handleResetFieldsAndCategories = async () => {
    // TODO: Wire up tRPC mutation for resetting fields, currencies, categories
    if (window.confirm("Are you sure you want to reset fields, currencies, and categories to defaults?")) {
      window.location.href = "/settings/fields"
    }
  }

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
          <Button variant="destructive" onClick={handleResetLLM}>
            {t("resetLlmPrompt")}
          </Button>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold">{t("fieldsCurrenciesCategoriesTitle")}</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-prose">
            {t("fieldsCurrenciesCategoriesResetDesc")}
          </p>
          <Button variant="destructive" onClick={handleResetFieldsAndCategories}>
            {t("resetFieldsCurrenciesCategories")}
          </Button>
        </div>
      </div>
    </div>
  )
}
