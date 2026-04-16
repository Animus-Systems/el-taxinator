
import { DateRangePicker } from "@/components/forms/date-range-picker"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectProject } from "@/components/forms/select-project"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"
import type { Category, Field, Project } from "@/lib/db-types"
import { formatDate } from "date-fns"
import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"

const deselectedFields = ["files", "text"]

export function ExportTransactionsDialog({
  fields,
  categories,
  projects,
  total,
  onClose,
}: {
  fields: Field[]
  categories: Category[]
  projects: Project[]
  total: number
  onClose: () => void
}) {
  const t = useTranslations("export")
  const locale = useLocale()
  const [exportFilters, setExportFilters] = useTransactionFilters()
  const [exportFields, setExportFields] = useState<string[]>(
    fields.map((field) => (deselectedFields.includes(field.code) ? "" : field.code))
  )
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Export progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleSubmit = async () => {
    try {
      const progressId = await startProgress("transactions-export")

      const exportUrl = `/export/transactions?${new URLSearchParams({
        search: exportFilters?.search || "",
        dateFrom: exportFilters?.dateFrom || "",
        dateTo: exportFilters?.dateTo || "",
        ordering: exportFilters?.ordering || "",
        categoryCode: exportFilters?.categoryCode || "",
        projectCode: exportFilters?.projectCode || "",
        fields: exportFields.join(","),
        includeAttachments: includeAttachments.toString(),
        progressId: progressId || "",
      }).toString()}`
      await download(exportUrl, "transactions.zip")
    } catch (error) {
      console.error("Failed to start export:", error)
    }
  }

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t("exportNTransactions", { count: total })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {exportFilters.search && (
              <div className="flex flex-row items-center gap-2">
                <span className="text-sm font-medium">{t("searchQuery")}</span>
                <span className="text-sm">{exportFilters.search}</span>
              </div>
            )}

            <div className="flex flex-row items-center gap-2">
              <span className="text-sm font-medium">{t("timeRange")}</span>

              <DateRangePicker
                defaultDate={{
                  from: exportFilters?.dateFrom ? new Date(exportFilters.dateFrom) : undefined,
                  to: exportFilters?.dateTo ? new Date(exportFilters.dateTo) : undefined,
                }}
                defaultRange="all-time"
                onChange={(date) => {
                  const dateFrom = date?.from ? formatDate(date.from, "yyyy-MM-dd") : undefined
                  const dateTo = date?.to ? formatDate(date.to, "yyyy-MM-dd") : undefined
                  setExportFilters({
                    ...exportFilters,
                    ...(dateFrom !== undefined ? { dateFrom } : {}),
                    ...(dateTo !== undefined ? { dateTo } : {}),
                  })
                }}
              />
            </div>

            <div className="flex flex-row items-center gap-2">
              <FormSelectCategory
                title="Category"
                name="category"
                categories={categories}
                {...(exportFilters.categoryCode !== undefined ? { value: exportFilters.categoryCode } : {})}
                onValueChange={(value) => setExportFilters({ ...exportFilters, categoryCode: value })}
                placeholder="All Categories"
                emptyValue="All Categories"
              />

              <FormSelectProject
                title="Project"
                name="project"
                projects={projects}
                {...(exportFilters.projectCode !== undefined ? { value: exportFilters.projectCode } : {})}
                onValueChange={(value) => setExportFilters({ ...exportFilters, projectCode: value })}
                placeholder="All Projects"
                emptyValue="All Projects"
              />
            </div>
          </div>

          <Separator />

          <div className="text-lg font-bold">{t("fieldsToInclude")}</div>

          <div className="grid grid-cols-2 gap-2">
            {fields.map((field) => (
              <div key={field.code} className="inline-flex gap-2">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name={field.code}
                    checked={exportFields.includes(field.code)}
                    onChange={(e) =>
                      setExportFields(
                        e.target.checked ? [...exportFields, field.code] : exportFields.filter((f) => f !== field.code)
                      )
                    }
                  />
                  <span>{getLocalizedValue(field.name, locale)}</span>
                </label>
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <label className="flex items-center gap-3 text-lg">
              <input
                type="checkbox"
                name="attachments"
                className="h-[20px] w-[20px]"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="font-medium">{t("includeAttachedFiles")}</span>
                <span className="text-sm">{t("createZipArchive")}</span>
              </span>
            </label>
          </div>
        </div>
        <DialogFooter className="sm:justify-end">
          <Button type="button" onClick={handleSubmit} disabled={isLoading || isDownloading}>
            {isLoading
              ? progress?.current
                ? t("archivingProgress", { current: progress.current, total: progress.total })
                : t("exporting")
              : isDownloading
                ? t("downloading")
                : t("exportTransactions")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
