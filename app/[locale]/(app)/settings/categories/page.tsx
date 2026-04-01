import { addCategoryAction, deleteCategoryAction, editCategoryAction } from "../actions"
import { CrudTable } from "@/components/settings/crud"
import { randomHexColor } from "@/lib/utils"
import { serverClient } from "@/lib/trpc/server-client"
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function CategoriesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const trpc = await serverClient()
  const categories = await trpc.categories.list({})
  const categoriesWithActions = categories.map((category: any) => ({
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
          "use server"
          return await deleteCategoryAction(code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCategoryAction(data as Record<string, unknown>)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCategoryAction(code, data as Record<string, unknown>)
        }}
      />
    </div>
  )
}
