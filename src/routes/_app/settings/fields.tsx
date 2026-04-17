/**
 * Fields settings page — SPA equivalent of app/[locale]/(app)/settings/fields/page.tsx
 *
 * CRUD table for custom fields. Fields with isExtra=false cannot be deleted.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { CrudTable } from "@/components/settings/crud"

export function FieldsSettingsPage() {
  const { t } = useTranslation("settings")
  const utils = trpc.useUtils()

  const { data: fields, isLoading } = trpc.fields.list.useQuery({})

  const createMutation = trpc.fields.create.useMutation({
    onSuccess: () => utils.fields.list.invalidate(),
  })
  const updateMutation = trpc.fields.update.useMutation({
    onSuccess: () => utils.fields.list.invalidate(),
  })
  const deleteMutation = trpc.fields.delete.useMutation({
    onSuccess: () => utils.fields.list.invalidate(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const fieldsWithActions = (fields ?? []).map((field) => ({
    ...field,
    isEditable: true,
    isDeletable: (field as Record<string, unknown>)["isExtra"] === true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("fieldsTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("fieldsDesc")}
      </p>

      <CrudTable
        compact
        items={fieldsWithActions}
        columns={[
          { key: "name", label: t("name"), editable: true },
          {
            key: "type",
            label: t("type"),
            type: "select",
            options: ["string", "number", "boolean"],
            defaultValue: "string",
            editable: true,
          },
          { key: "llmPrompt", label: t("llmPrompt"), editable: true },
          {
            key: "isVisibleInList",
            label: t("showInTransactionsTable"),
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isVisibleInAnalysis",
            label: t("showInAnalysisForm"),
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isRequired",
            label: t("isRequired"),
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
        ]}
        onDelete={async (code) => {
          try {
            await deleteMutation.mutateAsync({ code })
            return { success: true }
          } catch (error) {
            return { success: false, error: "Failed to delete field" }
          }
        }}
        onAdd={async (data) => {
          try {
            const d = data as Record<string, unknown>
            await createMutation.mutateAsync({
              name: d["name"] as string,
              type: (d["type"] as string) || "string",
              llmPrompt: (d["llmPrompt"] as string) || null,
              isVisibleInList: d["isVisibleInList"] as boolean ?? false,
              isVisibleInAnalysis: d["isVisibleInAnalysis"] as boolean ?? false,
              isRequired: d["isRequired"] as boolean ?? false,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to create field" }
          }
        }}
        onEdit={async (code, data) => {
          try {
            const d = data as Record<string, unknown>
            await updateMutation.mutateAsync({
              code,
              name: d["name"] as string,
              type: (d["type"] as string) || "string",
              llmPrompt: (d["llmPrompt"] as string) || null,
              isVisibleInList: d["isVisibleInList"] as boolean ?? false,
              isVisibleInAnalysis: d["isVisibleInAnalysis"] as boolean ?? false,
              isRequired: d["isRequired"] as boolean ?? false,
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to update field" }
          }
        }}
      />
    </div>
  )
}
