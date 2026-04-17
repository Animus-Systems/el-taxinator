/**
 * Accounts settings page — SPA equivalent of app/[locale]/(app)/settings/accounts/page.tsx
 *
 * CRUD table for bank accounts. Requires currencies list for the currency selector.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { CrudTable } from "@/components/settings/crud"

export function AccountsSettingsPage() {
  const { t } = useTranslation("settings")
  const utils = trpc.useUtils()

  const { data: accounts, isLoading: accountsLoading } = trpc.accounts.list.useQuery({})
  const { data: currencies, isLoading: currenciesLoading } = trpc.currencies.list.useQuery({})

  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => utils.accounts.list.invalidate(),
  })
  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => utils.accounts.list.invalidate(),
  })
  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => utils.accounts.list.invalidate(),
  })

  if (accountsLoading || currenciesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const currencyCodes = (currencies ?? []).map((c) => (c as Record<string, unknown>)["code"] as string)

  const accountsWithActions = (accounts ?? []).map((account) => ({
    ...account,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("accountsTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("accountsDesc")}
      </p>

      <CrudTable
        compact
        items={accountsWithActions}
        columns={[
          { key: "name", label: t("name"), editable: true },
          { key: "bankName", label: t("bankName"), editable: true },
          { key: "currencyCode", label: t("code"), type: "select", options: currencyCodes, editable: true },
          { key: "accountNumber", label: t("accountNumber"), editable: true },
          { key: "isActive", label: t("accountActive"), type: "checkbox", editable: true, defaultValue: true },
        ]}
        onDelete={async (id) => {
          try {
            await deleteMutation.mutateAsync({ id })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to delete account" }
          }
        }}
        onAdd={async (data) => {
          try {
            const d = data as Record<string, unknown>
            await createMutation.mutateAsync({
              name: d["name"] as string,
              bankName: (d["bankName"] as string) || undefined,
              currencyCode: d["currencyCode"] as string,
              accountNumber: (d["accountNumber"] as string) || undefined,
              isActive: d["isActive"] as boolean ?? true,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to create account" }
          }
        }}
        onEdit={async (id, data) => {
          try {
            const d = data as Record<string, unknown>
            await updateMutation.mutateAsync({
              id,
              name: (d["name"] as string) || undefined,
              bankName: (d["bankName"] as string) || undefined,
              currencyCode: (d["currencyCode"] as string) || undefined,
              accountNumber: (d["accountNumber"] as string) || undefined,
              isActive: d["isActive"] as boolean,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to update account" }
          }
        }}
      />
    </div>
  )
}
