/**
 * Time tracking page — SPA equivalent of app/[locale]/(app)/time/page.tsx
 *
 * Fetches time entries, projects, clients, and monthly summary via tRPC.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { TimeEntriesList } from "@/components/time/time-entries-list"
import { TimeSummary } from "@/components/time/time-summary"
import { TimerWidget } from "@/components/time/timer-widget"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { Link } from "@/lib/navigation"
import type { TimeEntrySummary } from "@/models/time-entries"

export function TimePage() {
  const { t } = useTranslation("time")

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { data: entries, isLoading: entriesLoading } = trpc.timeEntries.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: clients } = trpc.clients.list.useQuery({})
  const { data: monthlySummary } = trpc.timeEntries.summary.useQuery({
    dateFrom: monthStart.toISOString(),
    dateTo: monthEnd.toISOString(),
  })

  if (entriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const entryList = entries ?? []

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{entryList.length}</span>
        </h2>
        <Button asChild>
          <Link href="/time/new">
            <Plus /> <span className="hidden md:block">{t("logTime")}</span>
          </Link>
        </Button>
      </header>
      <main className="space-y-6">
        <TimerWidget projects={projects ?? []} clients={clients ?? []} />
        <TimeSummary summary={(monthlySummary ?? {
          totalMinutes: 0,
          billableMinutes: 0,
          totalAmount: 0,
          entryCount: 0,
        }) as TimeEntrySummary} />
        <TimeEntriesList entries={entryList} />
      </main>
    </>
  )
}
