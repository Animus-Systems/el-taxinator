import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import { getCurrentUser } from "@/lib/auth"
import { getSettings, updateSettings } from "@/models/settings"
import { Banknote, Brain, ChartBarStacked, FolderOpenDot, TextCursorInput, X } from "lucide-react"
import { revalidatePath } from "next/cache"
import Image from "next/image"
import { Link } from "@/lib/navigation"
import { getTranslations } from "next-intl/server"

export async function WelcomeWidget() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  const t = await getTranslations("welcome")
  const tSettings = await getTranslations("settings")
  const hasLLMKey = settings["openai_api_key"] || settings["google_api_key"] || settings["mistral_api_key"] || settings["anthropic_api_key"] || settings["openrouter_api_key"]

  return (
    <Card className="flex flex-col lg:flex-row items-start gap-10 p-10 w-full">
      <Image src="/logo/logo.webp" alt="Logo" width={256} height={256} className="w-64 h-64 shrink-0" />
      <div className="flex flex-col">
        <CardTitle className="flex items-center justify-between">
          <span className="text-2xl font-bold">
            <ColoredText>{t("welcomeToTaxinator")}</ColoredText>
          </span>
          <form action={async () => {
            "use server"
            await updateSettings(user.id, "is_welcome_message_hidden", "true")
            revalidatePath("/dashboard")
          }}>
            <Button variant="outline" size="icon" type="submit">
              <X className="h-4 w-4" />
            </Button>
          </form>
        </CardTitle>
        <CardDescription className="mt-5">
          <p className="mb-3">
            {t("welcomeDescription")}
          </p>
          <ul className="mb-5 list-disc pl-5 space-y-1">
            <li>
              <strong>{t("welcomeUpload")}</strong>{t("welcomeUploadDesc")}
            </li>
            <li>
              <strong>{t("welcomeBankStatement")}</strong>{t("welcomeBankStatementDesc")}
            </li>
            <li>
              <strong>{t("welcomeIgic")}</strong>{t("welcomeIgicDesc")}
            </li>
            <li>
              <strong>{t("welcomeMultiCompany")}</strong>{t("welcomeMultiCompanyDesc")}
            </li>
            <li>
              <strong>{t("welcomeInvoicing")}</strong>{t("welcomeInvoicingDesc")}
            </li>
            <li>
              <strong>{t("welcomeTime")}</strong>{t("welcomeTimeDesc")}
            </li>
            <li>
              <strong>{t("welcomeExport")}</strong>{t("welcomeExportDesc")}
            </li>
            <li>
              <strong>{t("welcomeAi")}</strong>{t("welcomeAiDesc")}
            </li>
          </ul>
        </CardDescription>
        <div className="flex flex-wrap gap-2 mt-2">
          {!hasLLMKey && (
            <Link href="/settings/llm">
              <Button>
                <Brain className="h-4 w-4" />
                {t("setUpAiProvider")}
              </Button>
            </Link>
          )}
          <Link href="/settings">
            <Button variant="outline">
              <Banknote className="h-4 w-4" />
              {t("currency", { code: settings["default_currency"] || "EUR" })}
            </Button>
          </Link>
          <Link href="/settings/categories">
            <Button variant="outline">
              <ChartBarStacked className="h-4 w-4" />
              {tSettings("categories")}
            </Button>
          </Link>
          <Link href="/settings/projects">
            <Button variant="outline">
              <FolderOpenDot className="h-4 w-4" />
              {tSettings("projects")}
            </Button>
          </Link>
          <Link href="/settings/fields">
            <Button variant="outline">
              <TextCursorInput className="h-4 w-4" />
              {t("customFieldsLabel")}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}
