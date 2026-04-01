import { TimeEntryForm } from "@/components/time/time-entry-form"
import { serverClient } from "@/lib/trpc/server-client"
import { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Edit Time Entry" }

export default async function EditTimeEntryPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [entry, projects, clients] = await Promise.all([
    trpc.timeEntries.getById({ id }),
    trpc.projects.list({}),
    trpc.clients.list({}),
  ])

  if (!entry) return notFound()

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">Edit Time Entry</h2>
      <TimeEntryForm entry={entry} projects={projects} clients={clients} />
    </div>
  )
}
