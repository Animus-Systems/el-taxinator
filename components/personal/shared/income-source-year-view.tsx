import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type { IncomeSource } from "@/models/income-sources"
import { IncomeSourceDetailPanel, type IncomeSourceKind } from "./income-source-detail-panel"

type SourceTotals = {
  sourceId: string
  grossCents: number
  netCents: number
  withheldCents: number
}

type Props = {
  kind: IncomeSourceKind
  title: string
  pageSubtitle: string
  headerIcon: ReactNode
  sourceIcon: ReactNode
  emptyIcon: ReactNode
  emptyHint: string
  confirmDeleteTitle: (name: string) => string
  confirmDeleteBody: (name: string) => string
  confirmDeleteLabel: string
  /** Action buttons rendered in the header next to the year picker. */
  headerActions: ReactNode
  /** Action buttons rendered inside the empty state. */
  emptyStateActions: ReactNode
  /**
   * Per-source subtitle — usually combines source metadata with linked-transaction totals.
   * Called once per row.
   */
  renderSourceSubtitle: (source: IncomeSource, totals: SourceTotals | undefined) => ReactNode
  /** Optional per-row badge row rendered next to the source name (e.g. NIF, rental type). */
  renderSourceBadges?: (source: IncomeSource) => ReactNode
}

/**
 * Shared year-scoped view for a single income source kind. Handles the year
 * picker with auto-correct, source list, expansion, and delete flow. Per-kind
 * header/empty/subtitle content is supplied by the caller.
 */
export function IncomeSourceYearView({
  kind,
  title,
  pageSubtitle,
  headerIcon,
  sourceIcon,
  emptyIcon,
  emptyHint,
  confirmDeleteTitle,
  confirmDeleteBody,
  confirmDeleteLabel,
  headerActions,
  emptyStateActions,
  renderSourceSubtitle,
  renderSourceBadges,
}: Props) {
  const { t } = useTranslation("tax")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [userPickedYear, setUserPickedYear] = useState(false)

  const { data: availableYears = [] } = trpc.incomeSources.availableYears.useQuery({ kind })

  useEffect(() => {
    if (userPickedYear) return
    if (availableYears.length === 0) return
    if (availableYears.includes(year)) return
    const latestWithData = availableYears[0]
    if (typeof latestWithData === "number") setYear(latestWithData)
  }, [availableYears, year, userPickedYear])

  const { data: sources = [], isLoading } = trpc.incomeSources.list.useQuery({ kind })
  const { data: totals = [] } = trpc.incomeSources.totals.useQuery({ year })

  const yearOptions = (() => {
    const now = new Date().getFullYear()
    const set = new Set<number>([now, now - 1, now - 2, now - 3, ...availableYears])
    return [...set].sort((a, b) => b - a).slice(0, 6)
  })()

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const totalsById = new Map(totals.map((x) => [x.sourceId, x]))

  const remove = trpc.incomeSources.delete.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
    },
  })

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: confirmDeleteTitle(name),
      description: confirmDeleteBody(name),
      confirmLabel: confirmDeleteLabel,
      variant: "destructive",
    })
    if (ok) remove.mutate({ id })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {headerIcon}
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-muted/60 p-0.5 text-[11px] flex-shrink-0">
            {yearOptions.map((y) => {
              const hasData = availableYears.includes(y)
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setUserPickedYear(true)
                    setYear(y)
                  }}
                  title={hasData ? undefined : t("personal.incomeSource.yearNoDataHint")}
                  className={[
                    "px-3 py-1 rounded-md transition-colors tabular-nums",
                    y === year
                      ? "bg-background shadow-sm text-foreground font-medium"
                      : hasData
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50 hover:text-muted-foreground",
                  ].join(" ")}
                >
                  {y}
                  {hasData && y !== year ? (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />
                  ) : null}
                </button>
              )
            })}
          </div>
          {headerActions}
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("personal.loading")}</p>
      ) : sources.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center px-6">
            {emptyIcon}
            <p className="text-sm">{emptyHint}</p>
            <div className="flex gap-2">{emptyStateActions}</div>
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sources.map((src) => {
            const srcTotals = totalsById.get(src.id)
            const isExpanded = expandedId === src.id
            return (
              <li key={src.id}>
                <Card className="overflow-hidden">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : src.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setExpandedId(isExpanded ? null : src.id)
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      {sourceIcon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{src.name}</span>
                        {renderSourceBadges?.(src)}
                        {!src.isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("personal.incomeSource.inactive")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {renderSourceSubtitle(src, srcTotals)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(src.id, src.name)
                      }}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {isExpanded ? (
                    <IncomeSourceDetailPanel sourceId={src.id} year={year} kind={kind} />
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
