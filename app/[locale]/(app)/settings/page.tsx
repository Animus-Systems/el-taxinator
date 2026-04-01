import GlobalSettingsForm from "@/components/settings/global-settings-form"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [settings, currencies, categories] = await Promise.all([
    trpc.settings.get({}),
    trpc.currencies.list({}),
    trpc.categories.list({}),
  ])

  return (
    <>
      <div className="w-full max-w-2xl">
        <GlobalSettingsForm settings={settings} currencies={currencies} categories={categories} />
      </div>
    </>
  )
}
