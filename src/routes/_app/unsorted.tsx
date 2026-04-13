/**
 * Unsorted files page — SPA equivalent of app/[locale]/(app)/unsorted/page.tsx
 *
 * Fetches unsorted files plus all supporting data (categories, projects, currencies,
 * fields, settings, invoices) and renders an AnalyzeForm per file.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { FilePreview } from "@/components/files/preview"
import { UploadButton } from "@/components/files/upload-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AnalyzeAllButton } from "@/components/unsorted/analyze-all-button"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import config from "@/lib/config"
import { FileText, PartyPopper, Settings, Upload } from "lucide-react"
import { Link } from "@/lib/navigation"
import type { File } from "@/lib/db-types"

export function UnsortedPage() {
  const { t } = useTranslation("unsorted")
  const { t: tNav } = useTranslation("nav")

  const { data: files, isLoading: filesLoading } = trpc.files.listUnsorted.useQuery({})
  const { data: categories } = trpc.categories.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: currencies } = trpc.currencies.list.useQuery({})
  const { data: fields } = trpc.fields.list.useQuery({})
  const { data: settings } = trpc.settings.get.useQuery({})
  const { data: invoices } = trpc.invoices.list.useQuery({})

  if (filesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const fileList = files ?? []
  const s = (settings ?? {}) as Record<string, unknown>

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("unsortedFiles", { count: fileList.length })}</h2>
        {fileList.length > 1 && <AnalyzeAllButton />}
      </header>

      {config.selfHosted.isEnabled &&
        !s.openai_api_key &&
        !s.google_api_key &&
        !s.mistral_api_key && (
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
        {fileList.map((file) => (
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
                file={file as File}
                categories={categories ?? []}
                projects={projects ?? []}
                currencies={currencies ?? []}
                fields={fields ?? []}
                settings={settings ?? {}}
                invoices={invoices ?? []}
              />
            </div>
          </Card>
        ))}
        {fileList.length === 0 && (
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
