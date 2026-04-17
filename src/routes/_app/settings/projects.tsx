/**
 * Projects settings page — SPA equivalent of app/[locale]/(app)/settings/projects/page.tsx
 *
 * CRUD table for projects, same pattern as categories.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { CrudTable } from "@/components/settings/crud"
import { randomHexColor } from "@/lib/utils"

export function ProjectsSettingsPage() {
  const { t } = useTranslation("settings")
  const utils = trpc.useUtils()

  const { data: projects, isLoading } = trpc.projects.list.useQuery({})

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  })
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  })
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const projectsWithActions = (projects ?? []).map((project) => ({
    ...project,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">{t("projectsTitle")}</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        {t("projectsDesc")}
      </p>

      <CrudTable
        compact
        items={projectsWithActions}
        columns={[
          { key: "name", label: t("name"), editable: true },
          { key: "llmPrompt", label: t("llmPrompt"), editable: true },
          { key: "color", label: t("color"), type: "color", defaultValue: randomHexColor() ?? "#888888", editable: true },
        ]}
        onDelete={async (code) => {
          try {
            await deleteMutation.mutateAsync({ code })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to delete project" }
          }
        }}
        onAdd={async (data) => {
          try {
            await createMutation.mutateAsync({
              name: (data as Record<string, unknown>)["name"] as string,
              llmPrompt: ((data as Record<string, unknown>)["llmPrompt"] as string) || null,
              color: ((data as Record<string, unknown>)["color"] as string) || randomHexColor() || "#888888",
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to create project" }
          }
        }}
        onEdit={async (code, data) => {
          try {
            await updateMutation.mutateAsync({
              code,
              name: (data as Record<string, unknown>)["name"] as string,
              llmPrompt: ((data as Record<string, unknown>)["llmPrompt"] as string) || null,
              color: ((data as Record<string, unknown>)["color"] as string) || "",
            })
            return { success: true }
          } catch {
            return { success: false, error: "Failed to update project" }
          }
        }}
      />
    </div>
  )
}
