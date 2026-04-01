import { getCurrentUser } from "@/lib/auth"
import { getAppData } from "@/models/apps"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"
import { InvoiceGenerator } from "./components/invoice-generator"
import { InvoiceTemplate } from "./default-templates"
import { manifest } from "./manifest"

export type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

export default async function InvoicesApp({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()
  const trpc = await serverClient()
  const [settings, currencies] = await Promise.all([
    trpc.settings.get({}),
    trpc.currencies.list({}),
  ])
  const appData = (await getAppData(user, "invoices")) as InvoiceAppData | null

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">
            {manifest.icon} {manifest.name}
          </span>
        </h2>
      </header>
      <InvoiceGenerator user={user} settings={settings} currencies={currencies} appData={appData} />
    </div>
  )
}
