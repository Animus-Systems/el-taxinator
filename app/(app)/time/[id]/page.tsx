import { TimeEntryForm } from "@/components/time/time-entry-form"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getProjects } from "@/models/projects"
import { getTimeEntryById } from "@/models/time-entries"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Edit Time Entry" }

export default async function EditTimeEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  const [entry, projects, clients] = await Promise.all([
    getTimeEntryById(id, user.id),
    getProjects(user.id),
    getClients(user.id),
  ])

  if (!entry) return notFound()

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">Edit Time Entry</h2>
      <TimeEntryForm entry={entry} projects={projects} clients={clients} />
    </div>
  )
}
