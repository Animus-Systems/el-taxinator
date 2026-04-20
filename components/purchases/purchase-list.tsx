import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, type BadgeProps } from "@/components/ui/badge"
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
import { formatCurrency } from "@/lib/utils"
import type { PurchaseWithRelations } from "@/models/purchases"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import {
  AlertTriangle,
  Eye,
  FileX2,
  Paperclip,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { DateRangePresetFilter, currentYearRange } from "@/components/ui/date-range-preset-filter"

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  received: "default",
  paid: "outline",
  overdue: "destructive",
  cancelled: "secondary",
  refunded: "default",
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

type StatusFilter = (typeof STATUS_OPTIONS)[number] | "all"
type FileFilter = "all" | "missing" | "attached"

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

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [fileFilter, setFileFilter] = useState<FileFilter>("all")
  // Default to the current tax year so users don't see last year's closed
  // paperwork on first load. Cleared via the date filter's × button.
  const [dateFrom, setDateFrom] = useState(() => currentYearRange().from)
  const [dateTo, setDateTo] = useState(() => currentYearRange().to)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    return purchases.filter((p) => {
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
  }, [purchases, search, statusFilter, fileFilter, dateFrom, dateTo])

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
              <TableHead>{t("issueDate")}</TableHead>
              <TableHead>{t("dueDate")}</TableHead>
              <TableHead>{t("supplierNumber")}</TableHead>
              <TableHead>{t("supplier")}</TableHead>
              <TableHead>{t("total")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((purchase) => {
              const { total } = calcInvoiceTotals(purchase.items)
              const missingFile = !purchase.pdfFileId
              return (
                <TableRow
                  key={purchase.id}
                  className={STATUS_ROW_ACCENT[purchase.status] ?? ""}
                >
                  <TableCell>{format(purchase.issueDate, "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    {purchase.dueDate ? format(purchase.dueDate, "yyyy-MM-dd") : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {purchase.supplierInvoiceNumber}
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
                          <Badge variant={STATUS_COLORS[purchase.status] ?? "secondary"}>
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
