import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { cn, formatCurrency } from "@/lib/utils"
import type { PurchaseWithRelations } from "@/models/purchases"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import {
  AlertTriangle,
  Eye,
  FileX2,
  Link2,
  Paperclip,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { DateRangePresetFilter, currentYearRange } from "@/components/ui/date-range-preset-filter"
import { SortableHeader, type SortState } from "@/components/ui/sortable-header"

/** Distinct per-status badge colors. Matches the row-accent palette so the
 *  side bar and badge read as one visual signal. */
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300",
  received: "bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300",
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300",
  cancelled: "bg-stone-100 text-stone-500 line-through hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-400",
  refunded: "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300",
}

/** Delicate left-border accent per purchase status. */
const STATUS_ROW_ACCENT: Record<string, string> = {
  draft: "border-l-2 border-l-zinc-400/40",
  received: "border-l-2 border-l-sky-500/60",
  paid: "border-l-2 border-l-emerald-500/70",
  overdue: "border-l-2 border-l-rose-500/70",
  cancelled: "border-l-2 border-l-zinc-400/30 opacity-60",
  refunded: "border-l-2 border-l-amber-500/60",
}

const STATUS_OPTIONS = [
  "draft",
  "received",
  "overdue",
  "paid",
  "cancelled",
  "refunded",
] as const
const STATUS_KEYS = STATUS_OPTIONS as readonly string[]

type StatusFilter = (typeof STATUS_OPTIONS)[number] | "all"
type FileFilter = "all" | "missing" | "attached"
type SortKey = "issueDate" | "dueDate" | "number" | "supplier" | "total" | "status"

function cmpStr(a: string | null | undefined, b: string | null | undefined): number {
  const av = (a ?? "").toLowerCase()
  const bv = (b ?? "").toLowerCase()
  return av < bv ? -1 : av > bv ? 1 : 0
}

function cmpDate(a: Date | null | undefined, b: Date | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.getTime() - b.getTime()
}

export function PurchaseList({
  purchases,
  onCreateNew,
}: {
  purchases: PurchaseWithRelations[]
  onCreateNew?: () => void
}) {
  const { t } = useTranslation("purchases")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const { data: paymentCounts = {} } = trpc.purchasePayments.countsByPurchase.useQuery({})

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [fileFilter, setFileFilter] = useState<FileFilter>("all")
  // Default to the current tax year so users don't see last year's closed
  // paperwork on first load. Cleared via the date filter's × button.
  const [dateFrom, setDateFrom] = useState(() => currentYearRange().from)
  const [dateTo, setDateTo] = useState(() => currentYearRange().to)
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "issueDate", direction: "desc" })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    const list = purchases.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (fileFilter === "missing" && p.pdfFileId) return false
      if (fileFilter === "attached" && !p.pdfFileId) return false
      if (from && p.issueDate < from) return false
      if (to && p.issueDate > to) return false
      if (q) {
        const hay = [
          p.supplierInvoiceNumber,
          p.contact?.name ?? "",
          p.contact?.taxId ?? "",
          p.notes ?? "",
        ]
          .join(" ")
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    if (!sort) return list
    const sign = sort.direction === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "issueDate":
          return sign * cmpDate(a.issueDate, b.issueDate)
        case "dueDate":
          return sign * cmpDate(a.dueDate, b.dueDate)
        case "number":
          return sign * cmpStr(a.supplierInvoiceNumber, b.supplierInvoiceNumber)
        case "supplier":
          return sign * cmpStr(a.contact?.name, b.contact?.name)
        case "total": {
          const ta = calcInvoiceTotals(a.items, a.totalCents).total
          const tb = calcInvoiceTotals(b.items, b.totalCents).total
          return sign * (ta - tb)
        }
        case "status":
          return sign * cmpStr(a.status, b.status)
        default:
          return 0
      }
    })
  }, [purchases, search, statusFilter, fileFilter, dateFrom, dateTo, sort])

  const deletePurchase = trpc.purchases.delete.useMutation({
    onSuccess: () => {
      utils.purchases.list.invalidate()
      toast.success(t("deleted"))
    },
    onError: (err) => toast.error(err.message || t("failedToDelete")),
  })

  async function onDelete(id: string): Promise<void> {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    deletePurchase.mutate({ id })
  }

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{t("empty")}</p>
        {onCreateNew && <Button onClick={onCreateNew}>{t("createFirst")}</Button>}
      </div>
    )
  }

  const filtersActive =
    search !== "" ||
    statusFilter !== "all" ||
    fileFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== ""

  function clearFilters(): void {
    setSearch("")
    setStatusFilter("all")
    setFileFilter("all")
    setDateFrom("")
    setDateTo("")
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fileFilter}
          onValueChange={(v) => setFileFilter(v as FileFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allFiles")}</SelectItem>
            <SelectItem value="missing">{t("filters.missingFiles")}</SelectItem>
            <SelectItem value="attached">{t("filters.withFiles")}</SelectItem>
          </SelectContent>
        </Select>
        <DateRangePresetFilter
          value={{ from: dateFrom, to: dateTo }}
          onChange={(r) => {
            setDateFrom(r.from)
            setDateTo(r.to)
          }}
        />
        {filtersActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" />
            {t("filters.clear")}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-muted-foreground">
          <p>{t("filters.noMatches")}</p>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {t("filters.clear")}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader<SortKey> columnKey="issueDate" sort={sort} onSort={setSort}>
                {t("issueDate")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="dueDate" sort={sort} onSort={setSort}>
                {t("dueDate")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="number" sort={sort} onSort={setSort}>
                {t("supplierNumber")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="supplier" sort={sort} onSort={setSort}>
                {t("supplier")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="total" sort={sort} onSort={setSort}>
                {t("total")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="status" sort={sort} onSort={setSort}>
                {t("status")}
              </SortableHeader>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((purchase) => {
              const { total } = calcInvoiceTotals(purchase.items, purchase.totalCents)
              const missingFile = !purchase.pdfFileId
              return (
                <TableRow
                  key={purchase.id}
                  className={cn(
                    STATUS_ROW_ACCENT[purchase.status] ?? "",
                    // Subtle rose tint on purchases with no linked outgoing
                    // transaction. Cancelled + refunded skip the tint since
                    // they don't expect an outflow. Draft isn't a standard
                    // purchase status but we exclude defensively for parity
                    // with the invoices list.
                    (paymentCounts[purchase.id] ?? 0) === 0 &&
                      purchase.status !== "cancelled" &&
                      purchase.status !== "refunded" &&
                      purchase.status !== "draft" &&
                      "bg-rose-50/40 hover:bg-rose-50/60 dark:bg-rose-950/10 dark:hover:bg-rose-950/20",
                  )}
                >
                  <TableCell>{format(purchase.issueDate, "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    {purchase.dueDate ? format(purchase.dueDate, "yyyy-MM-dd") : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {purchase.supplierInvoiceNumber}
                      {(() => {
                        const linkedCount = paymentCounts[purchase.id] ?? 0
                        if (linkedCount === 0) return null
                        const label = t("linkedTransactions", {
                          count: linkedCount,
                          defaultValue_one: "{count} transaction linked",
                          defaultValue_other: "{count} transactions linked",
                        })
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
                                aria-label={label}
                              >
                                <Link2 className="h-3.5 w-3.5" aria-hidden />
                                {linkedCount > 1 ? (
                                  <span className="text-[10px] font-mono tabular-nums">
                                    {linkedCount}
                                  </span>
                                ) : null}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              {label}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })()}
                      {missingFile ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                              aria-label={t("filters.missingFileTooltip")}
                            >
                              <FileX2 className="h-3.5 w-3.5" aria-hidden />
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {t("filters.missingFileTooltip")}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex text-muted-foreground"
                              aria-label={t("filters.hasFileTooltip")}
                            >
                              <Paperclip className="h-3 w-3" aria-hidden />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {t("filters.hasFileTooltip")}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{purchase.contact?.name ?? "—"}</TableCell>
                  <TableCell>{formatCurrency(total, purchase.currencyCode)}</TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Badge
                            variant="outline"
                            className={STATUS_KEYS.includes(purchase.status)
                              ? `border-transparent ${STATUS_BADGE[purchase.status] ?? ""}`
                              : ""}
                          >
                            {t(`statuses.${purchase.status}`, {
                              defaultValue: purchase.status,
                            })}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        {t(`statusHelp.${purchase.status}`, {
                          defaultValue: purchase.status,
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/purchases/${purchase.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("delete")}
                      title={t("delete")}
                      onClick={() => onDelete(purchase.id)}
                      disabled={deletePurchase.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </TooltipProvider>
  )
}
