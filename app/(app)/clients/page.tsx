import { ClientList } from "@/components/invoicing/client-list"
import { NewClientDialog } from "@/components/invoicing/new-client-dialog"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { Plus } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Clients",
  description: "Manage your clients",
}

export default async function ClientsPage() {
  const user = await getCurrentUser()
  const clients = await getClients(user.id)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Clients</span>
          <span className="text-3xl tracking-tight opacity-20">{clients.length}</span>
        </h2>
        <NewClientDialog>
          <Plus /> <span className="hidden md:block">Add Client</span>
        </NewClientDialog>
      </header>
      <main>
        <ClientList clients={clients} />
      </main>
    </>
  )
}
