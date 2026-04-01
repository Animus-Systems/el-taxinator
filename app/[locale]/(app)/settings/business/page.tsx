import BusinessSettingsForm from "@/components/settings/business-settings-form"
import { getCurrentUser } from "@/lib/auth"
import { setRequestLocale } from "next-intl/server"

export default async function BusinessSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()

  return (
    <>
      <div className="w-full max-w-2xl">
        <BusinessSettingsForm user={user} />
      </div>
    </>
  )
}
