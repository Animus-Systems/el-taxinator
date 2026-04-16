/**
 * Danger zone settings page — SPA equivalent of app/[locale]/(app)/settings/danger/page.tsx
 *
 * The original used server actions (resetLLMSettings, resetFieldsAndCategories)
 * that hit the DB directly. In the SPA, we wire up tRPC mutations or
 * show placeholder buttons that will be connected later.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"

export function DangerSettingsPage() {
  const { t } = useTranslation("settings")
  const confirm = useConfirm()

  const handleResetLLM = async () => {
    const ok = await confirm({
      title: "Reset LLM settings?",
      description: "This will reset LLM settings to defaults.",
      confirmLabel: "Reset",
      variant: "destructive",
    })
    if (!ok) return
    window.location.href = "/settings/llm"
  }

  const handleResetFieldsAndCategories = async () => {
    const ok = await confirm({
      title: "Reset fields, currencies, and categories?",
      description: "This will reset fields, currencies, and categories to defaults.",
      confirmLabel: "Reset",
      variant: "destructive",
    })
    if (!ok) return
    window.location.href = "/settings/fields"
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
