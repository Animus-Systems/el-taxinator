import { TimeEntriesList } from "@/components/time/time-entries-list"
import { TimeSummary } from "@/components/time/time-summary"
import { TimerWidget } from "@/components/time/timer-widget"
import { Button } from "@/components/ui/button"
import { serverClient } from "@/lib/trpc/server-client"
import { Plus } from "lucide-react"
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { Link } from "@/lib/navigation"

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "nav" })
  return { title: t("timeTracking") }
}

export default async function TimePage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "time" })
  const trpc = await serverClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [entries, projects, clients, monthlySummary] = await Promise.all([
    trpc.timeEntries.list({}),
    trpc.projects.list({}),
    trpc.clients.list({}),
    trpc.timeEntries.summary({ dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString() }),
  ])

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{entries.length}</span>
        </h2>
        <Button asChild>
          <Link href="/time/new">
            <Plus /> <span className="hidden md:block">{t("logTime")}</span>
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
