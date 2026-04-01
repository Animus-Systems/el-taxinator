import { ClientList } from "@/components/invoicing/client-list"
import { NewClientDialog } from "@/components/invoicing/new-client-dialog"
import { serverClient } from "@/lib/trpc/server-client"
import { Plus } from "lucide-react"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Clients",
  description: "Manage your clients",
}

export default async function ClientsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("clients")
  const trpc = await serverClient()
  const clients = await trpc.clients.list({})

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{clients.length}</span>
        </h2>
        <NewClientDialog>
          <Plus /> <span className="hidden md:block">{t("add")}</span>
        </NewClientDialog>
      </header>
      <main>
        <ClientList clients={clients} />
      </main>
    </>
  )
}
