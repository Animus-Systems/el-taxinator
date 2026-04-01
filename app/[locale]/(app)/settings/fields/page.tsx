import { addFieldAction, deleteFieldAction, editFieldAction } from "../actions"
import { CrudTable } from "@/components/settings/crud"
import { serverClient } from "@/lib/trpc/server-client"
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function FieldsSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const trpc = await serverClient()
  const fields = await trpc.fields.list({})
  const fieldsWithActions = fields.map((field: any) => ({
    ...field,
    isEditable: true,
    isDeletable: field.isExtra,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("fieldsTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("fieldsDesc")}
      </p>
      <CrudTable
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
          "use server"
          return await deleteFieldAction(code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addFieldAction(data as Record<string, unknown>)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editFieldAction(code, data as Record<string, unknown>)
        }}
      />
    </div>
  )
}
