import { FilePreview } from "@/components/files/preview"
import { UploadButton } from "@/components/files/upload-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AnalyzeAllButton } from "@/components/unsorted/analyze-all-button"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import config from "@/lib/config"
import { serverClient } from "@/lib/trpc/server-client"
import { FileText, PartyPopper, Settings, Upload } from "lucide-react"
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { Link } from "@/lib/navigation"

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "unsorted" })
  return { title: t("title") }
}

export default async function UnsortedPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "unsorted" })
  const tNav = await getTranslations({ locale, namespace: "nav" })
  const trpc = await serverClient()
  const [files, categories, projects, currencies, fields, settings, invoices] = await Promise.all([
    trpc.files.listUnsorted({}),
    trpc.categories.list({}),
    trpc.projects.list({}),
    trpc.currencies.list({}),
    trpc.fields.list({}),
    trpc.settings.get({}),
    trpc.invoices.list({}),
  ])

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("unsortedFiles", { count: files.length })}</h2>
        {files.length > 1 && <AnalyzeAllButton />}
      </header>

      {config.selfHosted.isEnabled &&
        !settings.openai_api_key &&
        !settings.google_api_key &&
        !settings.mistral_api_key && (
          <Alert>
            <Settings className="h-4 w-4 mt-2" />
            <div className="flex flex-row justify-between pt-2">
              <div className="flex flex-col">
                <AlertTitle>{t("llmKeyRequired")}</AlertTitle>
                <AlertDescription>
                  {t("llmKeyRequiredDesc")}
                </AlertDescription>
              </div>
              <Link href="/settings/llm">
                <Button>{t("goToSettings")}</Button>
              </Link>
            </div>
          </Alert>
        )}

      <main className="flex flex-col gap-5">
        {files.map((file: any) => (
          <Card
            key={file.id}
            id={file.id}
            className="flex flex-row flex-wrap md:flex-nowrap justify-center items-start gap-5 p-5 bg-gradient-to-br from-violet-50/80 via-indigo-50/80 to-white border-violet-200/60 rounded-2xl"
          >
            <div className="w-full max-w-[500px]">
              <Card>
                <FilePreview file={file} />
              </Card>
            </div>

            <div className="w-full">
              <AnalyzeForm
                file={file}
                categories={categories}
                projects={projects}
                currencies={currencies}
                fields={fields}
                settings={settings}
                invoices={invoices}
              />
            </div>
          </Card>
        ))}
        {files.length == 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[600px]">
            <PartyPopper className="w-12 h-12 text-muted-foreground" />
            <p className="pt-4 text-muted-foreground">{t("noFiles")}</p>
            <p className="flex flex-row gap-2 text-muted-foreground">
              <span>{t("dragDropFiles")}</span>
              <Upload />
            </p>

            <div className="flex flex-row gap-5 mt-8">
              <UploadButton>
                <Upload /> {t("uploadNewFile")}
              </UploadButton>
              <Button variant="outline" asChild>
                <Link href="/transactions">
                  <FileText />
                  {t("goToTransactions")}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
