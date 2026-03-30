import { TimeEntriesList } from "@/components/time/time-entries-list"
import { TimeSummary } from "@/components/time/time-summary"
import { TimerWidget } from "@/components/time/timer-widget"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getProjects } from "@/models/projects"
import { getTimeEntries, getTimeEntrySummary } from "@/models/time-entries"
import { Plus } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Time Tracking",
  description: "Track your billable hours and expenses",
}

export default async function TimePage() {
  const user = await getCurrentUser()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [entries, projects, clients, monthlySummary] = await Promise.all([
    getTimeEntries(user.id),
    getProjects(user.id),
    getClients(user.id),
    getTimeEntrySummary(user.id, monthStart, monthEnd),
  ])

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Time Tracking</span>
          <span className="text-3xl tracking-tight opacity-20">{entries.length}</span>
        </h2>
        <Button asChild>
          <Link href="/time/new">
            <Plus /> <span className="hidden md:block">Log Time</span>
          </Link>
        </Button>
      </header>
      <main className="space-y-6">
        <TimerWidget projects={projects} clients={clients} />
        <TimeSummary summary={monthlySummary} />
        <TimeEntriesList entries={entries} />
      </main>
    </>
  )
}
