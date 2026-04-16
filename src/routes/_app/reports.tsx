import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, History, Loader2 } from "lucide-react"

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ReportsPage() {
  const { t } = useTranslation("reports")
  const { data: sessions = [], isLoading } = trpc.wizard.listCommitted.useQuery({})

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <Badge variant="secondary">{sessions.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <History className="h-8 w-8" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <div className="truncate text-sm font-medium" title={s.title ?? s.fileName ?? s.id}>
                    {s.title || s.fileName || `Session ${s.id.slice(0, 8)}`}
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {s.entryMode}
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{formatDate(s.lastActivityAt)}</span>
                  <span>·</span>
                  <span>{t("transactionsCount", { count: s.candidateCount })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/wizard/${s.id}/committed` as string}>
                    <FileText className="h-4 w-4 mr-1.5" />
                    {t("open")}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`/api/wizard/session/${s.id}/report.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("downloadPdf")}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    {t("downloadPdf")}
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
