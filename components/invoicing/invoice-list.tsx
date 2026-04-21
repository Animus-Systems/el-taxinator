import { useMemo, useState } from "react"
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
import type { InvoiceWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import { useTranslations } from "next-intl"
import {
  AlertTriangle,
  Eye,
  FileText,
  FileX2,
  Link2,
  Paperclip,
  Search,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { PdfPreviewDialog } from "./pdf-preview-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { DateRangePresetFilter, currentYearRange } from "@/components/ui/date-range-preset-filter"
import { SortableHeader, type SortState } from "@/components/ui/sortable-header"
import { detectSeriesGaps } from "@/lib/invoice-series"

/** Distinct per-status badge colors — avoids shadcn variants collapsing
 *  draft+cancelled and sent+refunded onto the same neutral tone. */
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300",
  sent: "bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300",
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300",
  cancelled: "bg-stone-100 text-stone-500 line-through hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-400",
}

/** Delicate left-border accent per status — subtle visual scan aid. */
const STATUS_ROW_ACCENT: Record<string, string> = {
  draft: "border-l-2 border-l-zinc-400/40",
  sent: "border-l-2 border-l-sky-500/60",
  paid: "border-l-2 border-l-emerald-500/70",
  overdue: "border-l-2 border-l-rose-500/70",
  cancelled: "border-l-2 border-l-zinc-400/30 opacity-60",
}

const STATUS_OPTIONS = ["draft", "sent", "overdue", "paid", "cancelled"] as const
const STATUS_KEYS = STATUS_OPTIONS as readonly string[]

const KIND_OPTIONS = ["invoice", "simplified"] as const

type StatusFilter = (typeof STATUS_OPTIONS)[number] | "all"
type FileFilter = "all" | "missing" | "attached"
type KindFilter = (typeof KIND_OPTIONS)[number] | "all"

type SortKey = "issueDate" | "dueDate" | "number" | "client" | "total" | "status" | "kind"

function compareStrings(a: string | null | undefined, b: string | null | undefined): number {
  const av = (a ?? "").toLowerCase()
  const bv = (b ?? "").toLowerCase()
  return av < bv ? -1 : av > bv ? 1 : 0
}

function compareDates(a: Date | null | undefined, b: Date | null | undefined): number {
  // Nulls sort to the bottom so a "dueDate" sort doesn't bury every real date
  // under the unnull ones.
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.getTime() - b.getTime()
}

function compareNumbers(a: number, b: number): number {
  return a - b
}

export function InvoiceList({
  invoices,
  onCreateNew,
}: {
  invoices: InvoiceWithRelations[]
  onCreateNew?: () => void
}) {
  const t = useTranslations("invoices")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [preview, setPreview] = useState<{ fileId: string; title: string } | null>(null)
  const { data: paymentCounts = {} } = trpc.invoicePayments.countsByInvoice.useQuery({})

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [fileFilter, setFileFilter] = useState<FileFilter>("all")
  // Default to the current tax year so users don't see last year's closed
  // paperwork on first load. Cleared via the date filter's × button.
  const [dateFrom, setDateFrom] = useState(() => currentYearRange().from)
  const [dateTo, setDateTo] = useState(() => currentYearRange().to)
  // Default sort matches the old ORDER BY issue_date DESC from the server query
  // so first-load order is stable.
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "issueDate", direction: "desc" })

  const invoiceKind = (inv: InvoiceWithRelations): "invoice" | "simplified" => {
    const raw = (inv as { kind?: string }).kind
    return raw === "simplified" ? "simplified" : "invoice"
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    const list = invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false
      if (kindFilter !== "all" && invoiceKind(inv) !== kindFilter) return false
      if (fileFilter === "missing" && inv.pdfFileId) return false
      if (fileFilter === "attached" && !inv.pdfFileId) return false
      if (from && inv.issueDate < from) return false
      if (to && inv.issueDate > to) return false
      if (q) {
        const hay = [
          inv.number,
          inv.client?.name ?? "",
          inv.client?.taxId ?? "",
          inv.notes ?? "",
        ]
          .join(" ")
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    if (!sort) return list
    const sign = sort.direction === "asc" ? 1 : -1
    const sorted = [...list].sort((a, b) => {
      switch (sort.key) {
        case "issueDate":
          return sign * compareDates(a.issueDate, b.issueDate)
        case "dueDate":
          return sign * compareDates(a.dueDate, b.dueDate)
        case "number":
          return sign * compareStrings(a.number, b.number)
        case "client":
          return sign * compareStrings(a.client?.name, b.client?.name)
        case "total": {
          const ta = calcInvoiceTotals(a.items, a.totalCents).total
          const tb = calcInvoiceTotals(b.items, b.totalCents).total
          return sign * compareNumbers(ta, tb)
        }
        case "status":
          return sign * compareStrings(a.status, b.status)
        case "kind":
          return sign * compareStrings(invoiceKind(a), invoiceKind(b))
        default:
          return 0
      }
    })
    return sorted
  }, [invoices, search, statusFilter, kindFilter, fileFilter, dateFrom, dateTo, sort])

  /** Gap detection runs on the filtered list so that picking a date range
   * narrows the audit to that range. We pass the number of every row the user
   * is currently looking at. */
  const gaps = useMemo(() => detectSeriesGaps(filtered.map((i) => i.number)), [filtered])

  const deleteInvoice = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate()
      toast.success(t("invoiceDeleted"))
    },
    onError: (err) => {
      toast.error(err.message || t("failedToDeleteInvoice"))
    },
  })

  async function onDelete(id: string) {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    deleteInvoice.mutate({ id })
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{t("noInvoices")}</p>
        {onCreateNew && <Button onClick={onCreateNew}>{t("createFirst")}</Button>}
      </div>
    )
  }

  const filtersActive =
    search !== "" ||
    statusFilter !== "all" ||
    kindFilter !== "all" ||
    fileFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== ""

  function clearFilters(): void {
    setSearch("")
    setStatusFilter("all")
    setKindFilter("all")
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
                {t(s, { defaultValue: s })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={kindFilter}
          onValueChange={(v) => setKindFilter(v as KindFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allKinds", { defaultValue: "All kinds" })}</SelectItem>
            <SelectItem value="invoice">{t("kind.invoice", { defaultValue: "Invoices" })}</SelectItem>
            <SelectItem value="simplified">{t("kind.simplified", { defaultValue: "Simplified" })}</SelectItem>
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

      {gaps.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">
              {t("gaps.title", { count: gaps.length })}
            </span>
            <span className="text-amber-900/90 dark:text-amber-200/90">
              {gaps.slice(0, 8).map((g) => g.label).join(", ")}
              {gaps.length > 8
                ? ` … (+${gaps.length - 8})`
                : ""}
            </span>
            <span className="text-xs text-amber-800/70 dark:text-amber-200/70">
              {t("gaps.hint", {
                defaultValue: "Spanish law requires non-skipping correlative numbering per series.",
              })}
            </span>
          </div>
        </div>
      )}

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
                {t("number")}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="kind" sort={sort} onSort={setSort}>
                {t("kind.column", { defaultValue: "Kind" })}
              </SortableHeader>
              <SortableHeader<SortKey> columnKey="client" sort={sort} onSort={setSort}>
                {t("client")}
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
            {filtered.map((invoice) => {
              const { total } = calcInvoiceTotals(invoice.items, invoice.totalCents)
              const missingFile = !invoice.pdfFileId
              return (
                <TableRow
                  key={invoice.id}
                  className={cn(
                    STATUS_ROW_ACCENT[invoice.status] ?? "",
                    // Subtle rose tint on rows with no linked transactions so
                    // unmatched invoices stand out when scanning the list.
                    // Skip cancelled (doesn't need payment) and draft (not
                    // issued yet — no transaction expected).
                    (paymentCounts[invoice.id] ?? 0) === 0 &&
                      invoice.status !== "cancelled" &&
                      invoice.status !== "draft" &&
                      "bg-rose-50/40 hover:bg-rose-50/60 dark:bg-rose-950/10 dark:hover:bg-rose-950/20",
                  )}
                >
                  <TableCell>{format(invoice.issueDate, "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    {invoice.dueDate ? format(invoice.dueDate, "yyyy-MM-dd") : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {invoice.number}
                      {(() => {
                        const linkedCount = paymentCounts[invoice.id] ?? 0
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
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={invoiceKind(invoice) === "simplified"
                        ? "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900"
                        : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"}
                    >
                      {invoiceKind(invoice) === "simplified"
                        ? t("kind.simplifiedShort", { defaultValue: "Simplified" })
                        : t("kind.invoiceShort", { defaultValue: "Invoice" })}
                    </Badge>
                  </TableCell>
                  <TableCell>{invoice.client?.name || "—"}</TableCell>
                  <TableCell>{formatCurrency(total, invoice.currencyCode || "EUR")}</TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Badge
                            variant="outline"
                            className={STATUS_KEYS.includes(invoice.status)
                              ? `border-transparent ${STATUS_BADGE[invoice.status] ?? ""}`
                              : ""}
                          >
                            {t(invoice.status, { defaultValue: invoice.status })}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        {t(`statusHelp.${invoice.status}`, {
                          defaultValue: invoice.status,
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    {invoice.pdfFileId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("viewPdf")}
                        onClick={() => {
                          setPreview({
                            fileId: invoice.pdfFileId as string,
                            title: invoice.number,
                          })
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/invoices/${invoice.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("deleteInvoice")}
                      title={t("deleteInvoice")}
                      onClick={() => onDelete(invoice.id)}
                      disabled={deleteInvoice.isPending}
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

      <PdfPreviewDialog
        open={preview !== null}
        onOpenChange={(next) => {
          if (!next) setPreview(null)
        }}
        fileId={preview?.fileId ?? null}
        title={preview?.title}
      />
    </TooltipProvider>
  )
}
