import { TimeEntryForm } from "@/components/time/time-entry-form"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getProjects } from "@/models/projects"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Log Time" }

export default async function NewTimeEntryPage() {
  const user = await getCurrentUser()
  const [projects, clients] = await Promise.all([getProjects(user.id), getClients(user.id)])

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">Log Time</h2>
      <TimeEntryForm projects={projects} clients={clients} />
    </div>
  )
}
