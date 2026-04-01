import DashboardDropZoneWidget from "@/components/dashboard/drop-zone-widget"
import { StatsWidget } from "@/components/dashboard/stats-widget"
import DashboardUnsortedWidget from "@/components/dashboard/unsorted-widget"
import { WelcomeWidget } from "@/components/dashboard/welcome-widget"
import { Separator } from "@/components/ui/separator"
import config from "@/lib/config"
import { serverClient } from "@/lib/trpc/server-client"
import { TransactionFilters } from "@/models/transactions"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
  description: config.app.description,
}

export default async function Dashboard({ searchParams, params }: { searchParams: Promise<TransactionFilters>; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("dashboard")
  const filters = await searchParams
  const trpc = await serverClient()
  const [unsortedFiles, settings] = await Promise.all([
    trpc.files.listUnsorted({}),
    trpc.settings.get({}),
  ])

  return (
    <div className="flex flex-col gap-5 p-5 w-full max-w-7xl self-center">
      <div className="flex flex-col sm:flex-row gap-5 items-stretch h-full">
        <DashboardDropZoneWidget />

        <DashboardUnsortedWidget files={unsortedFiles} />
      </div>

      {settings.is_welcome_message_hidden !== "true" && <WelcomeWidget />}

      <Separator />

      <StatsWidget filters={filters} />
    </div>
  )
}
