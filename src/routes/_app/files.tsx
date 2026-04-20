import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatBytes } from "@/lib/utils"
import { Download, FileText, Loader2, Trash, Trash2, Link2 } from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/ui/confirm-dialog"

type StatusFilter = "all" | "unreviewed" | "linked" | "orphan"

const STATUS_FILTERS: StatusFilter[] = ["all", "unreviewed", "linked", "orphan"]

const PAGE_SIZE = 50

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleDateString()
}

function readSize(metadata: unknown): number {
  if (metadata && typeof metadata === "object" && "size" in metadata) {
    const raw = (metadata as Record<string, unknown>)["size"]
    const parsed = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function FilesPage() {
  const { t } = useTranslation("files")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading } = trpc.files.list.useQuery({
    status,
    search,
    page: 1,
    pageSize: page * PAGE_SIZE,
  })

  const files = data?.files ?? []
  const total = data?.total ?? 0
  const hasMore = files.length < total

  const deleteFile = trpc.files.delete.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate()
      utils.files.listUnsorted.invalidate()
    },
  })

  const deleteAllOrphans = trpc.files.deleteAllOrphans.useMutation({
    onSuccess: ({ deleted }) => {
      utils.files.list.invalidate()
      utils.files.listUnsorted.invalidate()
      toast.success(
        t("deleteAllOrphansDone", {
          count: deleted,
          defaultValue: deleted === 1
            ? "Deleted {count} orphan file."
            : "Deleted {count} orphan files.",
        }),
      )
    },
    onError: (err) => toast.error(err.message),
  })

  async function onDeleteAllOrphans(): Promise<void> {
    if (total === 0) return
    const ok = await confirm({
      title: t("deleteAllOrphansTitle", { defaultValue: "Delete all orphan files?" }),
      description: t("deleteAllOrphansConfirm", {
        count: total,
        defaultValue:
          total === 1
            ? "This permanently removes 1 orphan file. This cannot be undone."
            : "This permanently removes {count} orphan files. This cannot be undone.",
      }),
      confirmLabel: t("deleteAllOrphansButton", { defaultValue: "Delete all orphans" }),
      variant: "destructive",
    })
    if (!ok) return
    deleteAllOrphans.mutate({})
  }

  const filterLabel = useMemo<Record<StatusFilter, string>>(
    () => ({
      all: t("filterAll"),
      unreviewed: t("filterUnreviewed"),
      linked: t("filterLinked"),
      orphan: t("filterOrphan"),
    }),
    [t],
  )

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPage(1)
    setSearch(searchDraft)
  }

  function onFilterChange(next: StatusFilter) {
    setPage(1)
    setStatus(next)
  }

  async function onDelete(file: {
    id: string
    linkedTransactionId: string | null
    linkedTransactionName: string | null
    linkedInvoiceId: string | null
    linkedInvoiceNumber: string | null
    linkedImportSessionId: string | null
    linkedImportSessionTitle: string | null
    linkedImportSessionRole: "source" | "context" | null
    linkedDeductionId: string | null
    linkedDeductionKind: string | null
    linkedDeductionTaxYear: number | null
  }) {
    const targets: string[] = []
    if (file.linkedInvoiceId) {
      targets.push(
        file.linkedInvoiceNumber
          ? t("linkedToInvoice", { number: file.linkedInvoiceNumber })
          : t("linkedToInvoiceGeneric"),
      )
    }
    if (file.linkedTransactionId) {
      targets.push(file.linkedTransactionName ?? t("linkedToTransaction"))
    }
    if (file.linkedImportSessionId) {
      const label = file.linkedImportSessionTitle ?? t("linkedToImportGeneric")
      targets.push(
        file.linkedImportSessionRole === "context"
          ? t("linkedToImportContext", { title: label })
          : t("linkedToImportSource", { title: label }),
      )
    }
    if (file.linkedDeductionId) {
      targets.push(
        file.linkedDeductionKind && file.linkedDeductionTaxYear
          ? t("linkedToDeduction", {
              kind: file.linkedDeductionKind,
              year: file.linkedDeductionTaxYear,
            })
          : t("linkedToDeductionGeneric"),
      )
    }
    const description =
      targets.length > 0
        ? t("confirmDeleteLinked", { target: targets.join(", ") })
        : t("confirmDelete")
    const ok = await confirm({
      title: t("confirmDeleteTitle"),
      description,
      confirmLabel: t("actionDelete"),
      variant: "destructive",
    })
    if (!ok) return
    deleteFile.mutate({ id: file.id })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <Badge variant="secondary" className="ml-1">{total}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                status === f
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {filterLabel[f]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          {status === "orphan" && total > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDeleteAllOrphans}
              disabled={deleteAllOrphans.isPending}
            >
              {deleteAllOrphans.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash className="mr-1.5 h-4 w-4" />
              )}
              {t("deleteAllOrphansButton", {
                count: total,
                defaultValue: "Delete all orphans ({count})",
              })}
            </Button>
          )}
          <form onSubmit={onSearchSubmit} className="flex gap-2 md:w-80">
            <Input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
            <Button type="submit" variant="outline" size="sm">
              {t("searchButton")}
            </Button>
          </form>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {files.map((file) => {
            const size = readSize(file.metadata)
            return (
              <div key={file.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={`/files/download/${file.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                    title={file.filename}
                  >
                    {file.filename}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{file.mimetype}</span>
                    <span>·</span>
                    <span>{formatBytes(size)}</span>
                    <span>·</span>
                    <span>{formatDate(file.createdAt)}</span>
                    {file.linkedTransactionId && (
                      <>
                        <span>·</span>
                        <Link
                          to={`/transactions/${file.linkedTransactionId}` as string}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          {file.linkedTransactionName ?? t("linkedToTransaction")}
                        </Link>
                      </>
                    )}
                    {file.linkedInvoiceId && (
                      <>
                        <span>·</span>
                        <Link
                          to={`/invoices/${file.linkedInvoiceId}` as string}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          {file.linkedInvoiceNumber
                            ? t("linkedToInvoice", { number: file.linkedInvoiceNumber })
                            : t("linkedToInvoiceGeneric")}
                        </Link>
                      </>
                    )}
                    {file.linkedImportSessionId && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                          {file.linkedImportSessionRole === "context"
                            ? t("linkedToImportContext", {
                                title: file.linkedImportSessionTitle ?? t("linkedToImportGeneric"),
                              })
                            : t("linkedToImportSource", {
                                title: file.linkedImportSessionTitle ?? t("linkedToImportGeneric"),
                              })}
                        </span>
                      </>
                    )}
                    {file.linkedDeductionId && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                          {file.linkedDeductionKind && file.linkedDeductionTaxYear
                            ? t("linkedToDeduction", {
                                kind: file.linkedDeductionKind,
                                year: file.linkedDeductionTaxYear,
                              })
                            : t("linkedToDeductionGeneric")}
                        </span>
                      </>
                    )}
                    {!file.linkedTransactionId &&
                      !file.linkedInvoiceId &&
                      !file.linkedImportSessionId &&
                      !file.linkedDeductionId &&
                      !file.isReviewed && (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="text-[10px]">{t("unreviewedBadge")}</Badge>
                      </>
                    )}
                    {!file.linkedTransactionId &&
                      !file.linkedInvoiceId &&
                      !file.linkedImportSessionId &&
                      !file.linkedDeductionId &&
                      file.isReviewed && (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="text-[10px]">{t("orphanBadge")}</Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="icon" aria-label={t("actionDownload")}>
                    <a href={`/files/download/${file.id}`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("actionDelete")}
                    onClick={() => onDelete(file)}
                    disabled={deleteFile.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
            {t("showMore")}
          </Button>
        </div>
      )}
    </div>
  )
}
