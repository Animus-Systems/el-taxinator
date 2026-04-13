/**
 * Categories settings page — SPA equivalent of app/[locale]/(app)/settings/categories/page.tsx
 *
 * The original used server actions for CRUD operations.
 * In the SPA, we use tRPC mutations and pass them as callbacks to CrudTable.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { CrudTable } from "@/components/settings/crud"
import { randomHexColor } from "@/lib/utils"

export function CategoriesSettingsPage() {
  const { t } = useTranslation("settings")
  const utils = trpc.useUtils()

  const { data: categories, isLoading } = trpc.categories.list.useQuery({})

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  })
  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  })
  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const categoriesWithActions = (categories ?? []).map((category) => ({
    ...category,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("categoriesTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("categoriesDesc")}
      </p>

      <CrudTable
        items={categoriesWithActions}
        columns={[
          { key: "name", label: t("name"), editable: true },
          { key: "llmPrompt", label: t("llmPrompt"), editable: true },
          { key: "color", label: t("color"), type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          try {
            await deleteMutation.mutateAsync({ code })
            return { success: true }
          } catch (error) {
            return { success: false, error: "Failed to delete category" }
          }
        }}
        onAdd={async (data) => {
          try {
            await createMutation.mutateAsync({
              name: (data as Record<string, unknown>).name as string,
              llmPrompt: ((data as Record<string, unknown>).llmPrompt as string) || null,
              color: ((data as Record<string, unknown>).color as string) || randomHexColor(),
            })
            return { success: true }
          } catch (error) {
            return { success: false, error: "Failed to create category" }
          }
        }}
        onEdit={async (code, data) => {
          try {
            await updateMutation.mutateAsync({
              code,
              name: (data as Record<string, unknown>).name as string,
              llmPrompt: ((data as Record<string, unknown>).llmPrompt as string) || null,
              color: ((data as Record<string, unknown>).color as string) || "",
            })
            return { success: true }
          } catch (error) {
            return { success: false, error: "Failed to update category" }
          }
        }}
      />
    </div>
  )
}
