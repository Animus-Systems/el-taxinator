import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatBytes } from "@/lib/utils"
import { Download, FileText, Loader2, Trash2, Link2 } from "lucide-react"

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

  function onDelete(id: string) {
    if (!window.confirm(t("confirmDelete"))) return
    deleteFile.mutate({ id })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
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
                    {file.linkedTransactionId ? (
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
                    ) : !file.isReviewed ? (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="text-[10px]">{t("unreviewedBadge")}</Badge>
                      </>
                    ) : (
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
                    onClick={() => onDelete(file.id)}
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
