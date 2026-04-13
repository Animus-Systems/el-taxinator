/**
 * Clients page — SPA equivalent of app/[locale]/(app)/clients/page.tsx
 *
 * Fetches clients list via tRPC and renders ClientList + NewClientDialog.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { ClientList } from "@/components/invoicing/client-list"
import { NewClientDialog } from "@/components/invoicing/new-client-dialog"
import { Plus } from "lucide-react"

export function ClientsPage() {
  const { t } = useTranslation("clients")

  const { data: clients, isLoading } = trpc.clients.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const clientList = clients ?? []

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{clientList.length}</span>
        </h2>
        <NewClientDialog>
          <Plus /> <span className="hidden md:block">{t("add")}</span>
        </NewClientDialog>
      </header>
      <main>
        <ClientList clients={clientList} />
      </main>
    </>
  )
}
