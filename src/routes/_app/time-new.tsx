/**
 * New time entry page — SPA equivalent of app/[locale]/(app)/time/new/page.tsx
 *
 * Fetches projects and clients, renders the TimeEntryForm.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { TimeEntryForm } from "@/components/time/time-entry-form"

export function NewTimeEntryPage() {
  const { t } = useTranslation("time")

  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery({})
  const { data: clients, isLoading: clientsLoading } = trpc.clients.list.useQuery({})

  if (projectsLoading || clientsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">{t("logTime")}</h2>
      <TimeEntryForm projects={projects ?? []} clients={clients ?? []} />
    </div>
  )
}
