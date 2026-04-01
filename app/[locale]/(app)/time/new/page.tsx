import { TimeEntryForm } from "@/components/time/time-entry-form"
import { serverClient } from "@/lib/trpc/server-client"
import { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "Log Time" }

export default async function NewTimeEntryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [projects, clients] = await Promise.all([trpc.projects.list({}), trpc.clients.list({})])

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">Log Time</h2>
      <TimeEntryForm projects={projects} clients={clients} />
    </div>
  )
}
