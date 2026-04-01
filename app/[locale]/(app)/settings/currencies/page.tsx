import { addCurrencyAction, deleteCurrencyAction, editCurrencyAction } from "../actions"
import { CrudTable } from "@/components/settings/crud"
import { serverClient } from "@/lib/trpc/server-client"
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function CurrenciesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const trpc = await serverClient()
  const currencies = await trpc.currencies.list({})
  const currenciesWithActions = currencies.map((currency: any) => ({
    ...currency,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("currenciesTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("currenciesDesc")}
      </p>
      <CrudTable
        items={currenciesWithActions}
        columns={[
          { key: "code", label: t("code"), editable: true },
          { key: "name", label: t("name"), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteCurrencyAction(code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCurrencyAction(data as { code: string; name: string })
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCurrencyAction(code, data as { name: string })
        }}
      />
    </div>
  )
}
