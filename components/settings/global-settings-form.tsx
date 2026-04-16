
import { saveSettingsAction } from "@/actions/settings"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectType } from "@/components/forms/select-type"
import { Button } from "@/components/ui/button"
import type { Category, Currency } from "@/lib/db-types"
import { CircleCheckBig } from "lucide-react"
import { useActionState } from "react"
import { useTranslations } from "next-intl"

export default function GlobalSettingsForm({
  settings,
  currencies,
  categories,
}: {
  settings: Record<string, string>
  currencies: Currency[]
  categories: Category[]
}) {
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)
  const t = useTranslations("settings")

  return (
    <form action={saveAction} className="space-y-4">
      <FormSelectCurrency
        title={t("defaultCurrency")}
        name="default_currency"
        defaultValue={settings["default_currency"] ?? ""}
        currencies={currencies}
      />

      <FormSelectType title={t("defaultTransactionType")} name="default_type" defaultValue={settings["default_type"] ?? ""} />

      <FormSelectCategory
        title={t("defaultCategory")}
        name="default_category"
        defaultValue={settings["default_category"] ?? ""}
        categories={categories}
      />

      <div className="flex flex-row items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("saveSettings")}
        </Button>
        {saveState?.success && (
          <p className="text-green-500 flex flex-row items-center gap-2">
            <CircleCheckBig />
            {t("saved")}
          </p>
        )}
      </div>

      {saveState?.error && <FormError>{saveState.error}</FormError>}
    </form>
  )
}
