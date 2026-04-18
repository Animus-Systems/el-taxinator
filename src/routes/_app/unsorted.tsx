/**
 * Inbox page — /unsorted
 *
 * Actionable queue: files awaiting AI analysis + wizard sessions in progress.
 */
import { useTranslation } from "react-i18next"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AnalyzeAllButton } from "@/components/unsorted/analyze-all-button"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import { InboxFileRow } from "@/components/unsorted/inbox-file-row"
import { WizardSessionsInline } from "@/components/wizard/wizard-sessions-inline"
import config from "@/lib/config"
import { hasAnyProviderConfigured } from "@/lib/llm-providers"
import { Loader2, PartyPopper, Settings } from "lucide-react"
import { Link } from "@/lib/navigation"

type AnalyzeFormInvoice = NonNullable<ComponentProps<typeof AnalyzeForm>["invoices"]>[number]

function normalizeInvoice(inv: {
  quote?: unknown
  [x: string]: unknown
}): AnalyzeFormInvoice {
  const { quote, ...rest } = inv
  const base = rest as Omit<AnalyzeFormInvoice, "quote">
  return quote !== undefined
    ? ({ ...base, quote } as AnalyzeFormInvoice)
    : (base as AnalyzeFormInvoice)
}

export function UnsortedPage() {
  const { t } = useTranslation("unsorted")

  const { data: files, isLoading: filesLoading } = trpc.files.listUnsorted.useQuery({})
  const { data: sessions = [] } = trpc.wizard.listResumable.useQuery()
  const { data: categories } = trpc.categories.list.useQuery({})
  const { data: projects } = trpc.projects.list.useQuery({})
  const { data: currencies } = trpc.currencies.list.useQuery({})
  const { data: fields } = trpc.fields.list.useQuery({})
  const { data: settings } = trpc.settings.get.useQuery({})
  const { data: invoices } = trpc.invoices.list.useQuery({})

  if (filesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const fileList = files ?? []
  const settingsMap = (settings ?? {}) as Record<string, string>
  const hasActivity = fileList.length > 0 || sessions.length > 0
  const showLlmWarning =
    config.selfHosted.isEnabled && hasActivity && !hasAnyProviderConfigured(settingsMap)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {fileList.length > 1 && <AnalyzeAllButton />}
      </header>

      {showLlmWarning && (
        <Alert>
          <Settings className="h-4 w-4" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <AlertTitle>{t("llmKeyRequired")}</AlertTitle>
              <AlertDescription>{t("llmKeyRequiredDesc")}</AlertDescription>
            </div>
            <Link href="/settings/llm">
              <Button size="sm">{t("goToSettings")}</Button>
            </Link>
          </div>
        </Alert>
      )}

      <WizardSessionsInline />

      {fileList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("unreviewedFilesHeading", { count: fileList.length })}
          </h2>
          <div className="flex flex-col gap-2">
            {fileList.map((file) => (
              <InboxFileRow
                key={file.id}
                file={file}
                categories={categories ?? []}
                projects={projects ?? []}
                currencies={currencies ?? []}
                fields={fields ?? []}
                settings={settings ?? {}}
                invoices={(invoices ?? []).map(normalizeInvoice)}
              />
            ))}
          </div>
        </section>
      )}

      {!hasActivity && (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <PartyPopper className="h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-lg font-medium">{t("inboxZero")}</p>
          <p className="text-sm text-muted-foreground">{t("inboxZeroDesc")}</p>
        </div>
      )}
    </div>
  )
}
