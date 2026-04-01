import LLMSettingsForm from "@/components/settings/llm-settings-form"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"

export default async function LlmSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [settings, fields] = await Promise.all([
    trpc.settings.get({}),
    trpc.fields.list({}),
  ])

  return (
    <div className="w-full max-w-2xl">
      <LLMSettingsForm settings={settings} fields={fields} />
    </div>
  )
}
