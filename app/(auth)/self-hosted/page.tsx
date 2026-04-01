import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import config from "@/lib/config"
import { PROVIDERS } from "@/lib/llm-providers"
import { getSelfHostedUser } from "@/models/users"
import { ShieldAlert } from "lucide-react"
import { getTranslations } from "next-intl/server"
import Image from "next/image"
import { redirect } from "next/navigation"
import SelfHostedSetupFormClient from "./setup-form-client"

export default async function SelfHostedWelcomePage() {
  const t = await getTranslations("auth")

  if (!config.selfHosted.isEnabled) {
    return (
      <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-6">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6" />
          <span>{t("selfHostedNotEnabled")}</span>
        </CardTitle>
        <CardDescription className="text-center text-lg flex flex-col gap-2">
          <p>
            {t("selfHostedNotEnabledDesc1")} <code className="font-bold">SELF_HOSTED_MODE=true</code>{" "}
            {t("selfHostedNotEnabledDesc2")}
          </p>
          <p>{t("selfHostedNotEnabledDesc3")}</p>
        </CardDescription>
      </Card>
    )
  }

  const user = await getSelfHostedUser()
  if (user) {
    redirect("/dashboard")
  }

  const defaultProvider = PROVIDERS[0].key
  const configuredKeys: Record<string, boolean> = {
    openai: !!config.ai.openaiApiKey,
    google: !!config.ai.googleApiKey,
    mistral: !!config.ai.mistralApiKey,
    anthropic: !!config.ai.anthropicApiKey,
  }

  return (
    <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-4">
      <Image src="/logo/logo.webp" alt="Taxinator" width={144} height={144} className="w-36 h-36 rounded-2xl" />
      <CardTitle className="text-3xl font-bold ">
        <ColoredText>{t("selfHostedEdition")}</ColoredText>
      </CardTitle>
      <CardDescription className="flex flex-col gap-4 text-center text-lg">
        <p>{t("welcome")}</p>
        <SelfHostedSetupFormClient defaultProvider={defaultProvider} configuredKeys={configuredKeys} />
      </CardDescription>
    </Card>
  )
}

export const dynamic = "force-dynamic"
