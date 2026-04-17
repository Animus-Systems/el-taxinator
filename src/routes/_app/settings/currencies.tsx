/**
 * Currencies settings page — SPA equivalent of app/[locale]/(app)/settings/currencies/page.tsx
 *
 * CRUD table for currencies.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { CrudTable } from "@/components/settings/crud"

export function CurrenciesSettingsPage() {
  const { t } = useTranslation("settings")
  const utils = trpc.useUtils()

  const { data: currencies, isLoading } = trpc.currencies.list.useQuery({})

  const createMutation = trpc.currencies.create.useMutation({
    onSuccess: () => utils.currencies.list.invalidate(),
  })
  const updateMutation = trpc.currencies.update.useMutation({
    onSuccess: () => utils.currencies.list.invalidate(),
  })
  const deleteMutation = trpc.currencies.delete.useMutation({
    onSuccess: () => utils.currencies.list.invalidate(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const currenciesWithActions = (currencies ?? []).map((currency) => ({
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
        compact
        items={currenciesWithActions}
        columns={[
          { key: "code", label: t("code"), editable: true },
          { key: "name", label: t("name"), editable: true },
        ]}
        onDelete={async (code) => {
          try {
            await deleteMutation.mutateAsync({ code })
            return { success: true }
          } catch (error) {
            return { success: false, error: "Failed to delete currency" }
          }
        }}
        onAdd={async (data) => {
          try {
            await createMutation.mutateAsync({
              code: (data as Record<string, unknown>)["code"] as string,
              name: (data as Record<string, unknown>)["name"] as string,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to create currency" }
          }
        }}
        onEdit={async (code, data) => {
          try {
            await updateMutation.mutateAsync({
              code,
              name: (data as Record<string, unknown>)["name"] as string,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to update currency" }
          }
        }}
      />
    </div>
  )
}
