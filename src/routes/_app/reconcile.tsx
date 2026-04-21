/**
 * Unified reconciliation — drag invoices or purchases onto transactions.
 *
 * Layout: two-column board.
 *   Left  = documents waiting for a payment (invoices + purchases, color-
 *           coded: emerald = invoice/income, rose = purchase/expense).
 *   Right = transactions waiting for an allocation (same color coding by
 *           income/expense). Each transaction card is a drop target.
 *
 * Interactions:
 *   - DRAG a document card onto a transaction card → creates an allocation
 *     (defaults amount to min(document outstanding, tx outstanding); cash
 *     aggregation is supported because dropping again on a partially-
 *     allocated tx just tops it up).
 *   - "Analyze with AI" suggests matches for both invoices & purchases;
 *     accept/reject per row, or Accept All.
 *   - Rows that are fully allocated fade out and disappear on refetch.
 *
 * No DB writes from this file — everything routes through trpc.reconcile.*.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  FileText,
  GripVertical,
  Link2,
  Loader2,
  Pencil,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Unlink,
  Wrench,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangePresetFilter } from "@/components/ui/date-range-preset-filter"
import { Link } from "@/lib/navigation"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

type DocKind = "invoice" | "purchase"

type ReconcileDoc = {
  id: string
  kind: DocKind
  number: string
  contactName: string | null
  issueDate: Date
  totalCents: number
  allocatedCents: number
  status: string
  currencyCode: string
  notes: string | null
}

type ReconcileTx = {
  id: string
  name: string | null
  merchant: string | null
  description: string | null
  issuedAt: Date | null
  totalCents: number
  type: string | null
  status: string | null
  currencyCode: string | null
  categoryCode: string | null
  accountId: string | null
  accountName: string | null
  note: string | null
  allocatedCents: number
}

type SuggestedMatch = {
  documentId: string
  documentKind: DocKind
  transactionId: string
  amountCents: number
  confidence: number
  reasoning: string
}

type LinkedPair = {
  paymentId: string
  documentKind: DocKind
  documentId: string
  documentNumber: string
  documentContactName: string | null
  documentIssueDate: Date
  documentTotalCents: number
  documentCurrencyCode: string
  transactionId: string
  transactionName: string | null
  transactionMerchant: string | null
  transactionIssuedAt: Date | null
  transactionTotalCents: number
  transactionType: string | null
  transactionCurrencyCode: string | null
  amountCents: number
  source: string
  createdAt: Date
}

const DRAG_ID_PREFIX = "doc:"
const DROP_ID_PREFIX = "tx:"

function docIdForDrag(id: string): string {
  return `${DRAG_ID_PREFIX}${id}`
}
function txIdForDrop(id: string): string {
  return `${DROP_ID_PREFIX}${id}`
}

/** Accent palette per document kind — same hues used by the invoices/
 *  purchases list row-borders so the whole app reads as one system. */
const DOC_ACCENT = {
  invoice: {
    ring: "ring-emerald-500/40",
    border: "border-emerald-200 dark:border-emerald-900",
    bar: "bg-emerald-500/70",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  purchase: {
    ring: "ring-rose-500/40",
    border: "border-rose-200 dark:border-rose-900",
    bar: "bg-rose-500/70",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    icon: "text-rose-600 dark:text-rose-400",
  },
} as const

const TX_ACCENT = {
  income: "border-l-emerald-500/60",
  expense: "border-l-rose-500/60",
  other: "border-l-zinc-400/40",
} as const

function txAccent(type: string | null): string {
  if (type === "income") return TX_ACCENT.income
  if (type === "expense") return TX_ACCENT.expense
  return TX_ACCENT.other
}

function confidenceColor(c: number): string {
  if (c >= 0.75) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
  if (c >= 0.5) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
}

// Map document statuses to coloured badge classes. Unknown statuses fall
// back to neutral so new statuses don't render invisible text.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    case "sent":
    case "received":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    case "overdue":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
    case "draft":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    case "cancelled":
      return "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-900 dark:text-zinc-400"
    case "refunded":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  }
}

// ─── Card components ──────────────────────────────────────────────────────

function DocumentCard({
  doc,
  compact,
  highlight,
}: {
  doc: ReconcileDoc
  compact?: boolean
  highlight?: boolean
}) {
  const outstanding = Math.max(doc.totalCents - doc.allocatedCents, 0)
  const accent = DOC_ACCENT[doc.kind]
  const Icon = doc.kind === "invoice" ? FileText : Receipt
  return (
    <div
      className={cn(
        "relative rounded-md border bg-background px-3 py-2 shadow-sm transition",
        accent.border,
        highlight && "ring-2 ring-offset-2 ring-sky-500",
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-md", accent.bar)} aria-hidden />
      <div className="flex items-start gap-2 pl-1">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", accent.icon)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{doc.number}</span>
            <Badge variant="outline" className={cn("text-[10px]", accent.chip, "border-transparent")}>
              {doc.kind === "invoice" ? "Invoice" : "Purchase"}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-[10px] border-transparent", statusBadgeClass(doc.status))}
              title={doc.status}
            >
              {doc.status}
            </Badge>
          </div>
          {!compact && (
            <div className="text-xs text-muted-foreground">
              {doc.contactName ?? "—"} · {format(doc.issueDate, "yyyy-MM-dd")}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium">
            {formatCurrency(outstanding, doc.currencyCode)}
          </div>
          {doc.allocatedCents > 0 && (
            <div className="text-[11px] text-muted-foreground">
              of {formatCurrency(doc.totalCents, doc.currencyCode)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DraggableDocument({ doc }: { doc: ReconcileDoc }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: docIdForDrag(doc.id),
    data: { doc },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-stretch gap-1">
        <div className="flex items-center px-1 text-muted-foreground">
          <GripVertical className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1">
          <DocumentCard doc={doc} />
        </div>
      </div>
    </div>
  )
}

function TransactionDropTarget({
  tx,
  active,
  accepts,
  children,
}: {
  tx: ReconcileTx
  active: boolean
  accepts: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: txIdForDrop(tx.id) })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-md border-l-2 border bg-background px-3 py-2 shadow-sm transition",
        txAccent(tx.type),
        active && accepts && "ring-2 ring-sky-500/70 ring-offset-1",
        active && !accepts && "opacity-40",
        isOver && accepts && "bg-sky-50 dark:bg-sky-950/40",
        isOver && !accepts && "border-rose-400",
      )}
    >
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function ReconcilePage() {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()

  const [activeTab, setActiveTab] = useState<
    "invoices" | "purchases" | "linkedInvoices" | "linkedPurchases"
  >("invoices")
  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([])
  const [dismissedIdx, setDismissedIdx] = useState<Set<number>>(new Set())
  const [activeDrag, setActiveDrag] = useState<ReconcileDoc | null>(null)

  // Filter bar state. All filters are AND-combined. Applied to both unlinked
  // documents/transactions AND linked pairs so the "narrow down" is consistent
  // across tabs.
  const [filterSearch, setFilterSearch] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCurrency, setFilterCurrency] = useState<string>("all")

  const { data, isLoading } = trpc.reconcile.data.useQuery({})
  // Fetch existing links lazily — only when the user switches to a linked
  // tab. Avoids a wasted round-trip on the usual reconcile flow.
  const linksQuery = trpc.reconcile.links.useQuery(
    {},
    {
      enabled: activeTab === "linkedInvoices" || activeTab === "linkedPurchases",
    },
  )
  const confirmDialog = useConfirm()
  const documents = useMemo<ReconcileDoc[]>(
    () => (data?.documents as ReconcileDoc[] | undefined) ?? [],
    [data],
  )
  const transactions = useMemo<ReconcileTx[]>(
    () => (data?.transactions as ReconcileTx[] | undefined) ?? [],
    [data],
  )

  const aiMatch = trpc.reconcile.aiMatch.useMutation({
    onSuccess: (result) => {
      setSuggestions(result)
      setDismissedIdx(new Set())
      if (result.length === 0) {
        toast.message(t("reconcile.noMatchesFound", { defaultValue: "No plausible matches found." }))
      }
    },
    onError: (err) => toast.error(err.message),
  })

  const allocate = trpc.reconcile.allocate.useMutation({
    onSuccess: () => {
      utils.reconcile.data.invalidate()
      utils.reconcile.links.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const unallocate = trpc.reconcile.unallocate.useMutation({
    onSuccess: () => {
      utils.reconcile.data.invalidate()
      utils.reconcile.links.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
      toast.success(
        t("reconcile.unlinked", { defaultValue: "Allocation removed." }),
      )
    },
    onError: (err) => toast.error(err.message),
  })

  const snapTotals = trpc.reconcile.snapDriftedTotals.useMutation({
    onSuccess: (r) => {
      utils.reconcile.data.invalidate()
      utils.reconcile.links.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
      const fixed = r.invoicesFixed + r.purchasesFixed
      if (fixed === 0) {
        toast.message(
          t("reconcile.snap.noneFixed", {
            defaultValue: "No drifted totals found within the €1 tolerance.",
          }),
        )
      } else {
        toast.success(
          t("reconcile.snap.done", {
            count: fixed,
            defaultValue_one: "Fixed {count} document.",
            defaultValue_other: "Fixed {count} documents.",
          }),
        )
      }
    },
    onError: (err) => toast.error(err.message),
  })

  const resyncPaid = trpc.reconcile.resyncPaidStatus.useMutation({
    onSuccess: (r) => {
      utils.reconcile.data.invalidate()
      utils.reconcile.links.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
      const fixed = r.invoicesResynced + r.purchasesResynced
      if (fixed === 0) {
        toast.message(
          t("reconcile.resync.noneFixed", {
            defaultValue: "No stale paid documents found.",
          }),
        )
      } else {
        toast.success(
          t("reconcile.resync.done", {
            count: fixed,
            defaultValue_one: "Reset {count} stale paid document.",
            defaultValue_other: "Reset {count} stale paid documents.",
          }),
        )
      }
    },
    onError: (err) => toast.error(err.message),
  })

  async function onResyncPaid(): Promise<void> {
    const preview = await resyncPaid.mutateAsync({ dryRun: true }).catch(() => null)
    if (!preview) return
    const fixable = preview.invoicesResynced + preview.purchasesResynced
    if (fixable === 0) {
      toast.message(
        t("reconcile.resync.noneFixable", {
          defaultValue: "No stale paid documents — every paid doc still has payments linked.",
        }),
      )
      return
    }
    const ok = await confirmDialog({
      title: t("reconcile.resync.confirmTitle", {
        defaultValue: "Reset stale paid status?",
      }),
      description: t("reconcile.resync.confirmDesc", {
        invoices: preview.invoicesResynced,
        purchases: preview.purchasesResynced,
        defaultValue:
          "{invoices} invoices and {purchases} purchases are marked 'paid' but have zero linked payments (likely because the linked transactions were deleted). Revert them to 'sent' / 'received'?",
      }),
      confirmLabel: t("reconcile.resync.confirm", { defaultValue: "Reset status" }),
    })
    if (!ok) return
    resyncPaid.mutate({ dryRun: false })
  }

  async function onSnapTotals(): Promise<void> {
    // Preview pass first, so the confirm dialog can report exact counts.
    const preview = await snapTotals.mutateAsync({ dryRun: true }).catch(() => null)
    if (!preview) return
    const fixable = preview.invoicesFixed + preview.purchasesFixed
    if (fixable === 0) {
      toast.message(
        t("reconcile.snap.noneFixable", {
          defaultValue: "Nothing to fix — all totals are already clean.",
        }),
      )
      return
    }
    const ok = await confirmDialog({
      title: t("reconcile.snap.confirmTitle", {
        defaultValue: "Snap drifted totals?",
      }),
      description: t("reconcile.snap.confirmDesc", {
        invoices: preview.invoicesFixed,
        purchases: preview.purchasesFixed,
        skipped: preview.skippedDifferenceTooLarge,
        defaultValue:
          "For {invoices} invoices and {purchases} purchases, set the printed total to the amount actually paid (drift ≤ €1). {skipped} docs skipped because the drift was larger than €1.",
      }),
      confirmLabel: t("reconcile.snap.confirm", { defaultValue: "Fix totals" }),
    })
    if (!ok) return
    snapTotals.mutate({ dryRun: false })
  }

  const updateAmount = trpc.reconcile.updateAllocationAmount.useMutation({
    onSuccess: () => {
      utils.reconcile.links.invalidate()
      utils.reconcile.data.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
      toast.success(
        t("reconcile.amountUpdated", { defaultValue: "Amount updated." }),
      )
    },
    onError: (err) => toast.error(err.message),
  })

  const docsById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents])
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // ─── DnD handlers ───

  function onDragStart(event: DragStartEvent): void {
    const id = String(event.active.id)
    if (!id.startsWith(DRAG_ID_PREFIX)) return
    const doc = docsById.get(id.slice(DRAG_ID_PREFIX.length))
    setActiveDrag(doc ?? null)
  }

  function onDragEnd(event: DragEndEvent): void {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const dragId = String(active.id)
    const dropId = String(over.id)
    if (!dragId.startsWith(DRAG_ID_PREFIX) || !dropId.startsWith(DROP_ID_PREFIX)) return
    const doc = docsById.get(dragId.slice(DRAG_ID_PREFIX.length))
    const tx = txById.get(dropId.slice(DROP_ID_PREFIX.length))
    if (!doc || !tx) return
    if (!canPair(doc, tx)) {
      toast.error(t("reconcile.invalidPairing", {
        defaultValue: "Can't pair — directions or currencies don't match.",
      }))
      return
    }
    const amount = Math.min(
      Math.max(doc.totalCents - doc.allocatedCents, 0),
      Math.max(tx.totalCents - tx.allocatedCents, 0),
    )
    if (amount <= 0) return
    allocate.mutate({
      documentId: doc.id,
      documentKind: doc.kind,
      transactionId: tx.id,
      amountCents: amount,
      source: "manual",
    })
  }

  /** Cross-direction pairings are legal and represent refunds:
   *   - expense tx → invoice = user paid client back
   *   - income tx → purchase = supplier paid user back
   * So the only hard constraint is currency; direction is advisory. */
  function canPair(doc: ReconcileDoc, tx: ReconcileTx): boolean {
    if (tx.currencyCode && doc.currencyCode && tx.currencyCode !== doc.currencyCode) {
      return false
    }
    return true
  }


  // ─── Suggestions ───

  const visibleSuggestions = suggestions
    .map((s, idx) => ({ s, idx }))
    .filter(({ idx }) => !dismissedIdx.has(idx))
    .filter(({ s }) => docsById.has(s.documentId) && txById.has(s.transactionId))

  async function acceptSuggestion(s: SuggestedMatch, idx: number): Promise<void> {
    try {
      await allocate.mutateAsync({
        documentId: s.documentId,
        documentKind: s.documentKind,
        transactionId: s.transactionId,
        amountCents: s.amountCents,
        source: "ai",
      })
      setDismissedIdx((prev) => {
        const next = new Set(prev)
        next.add(idx)
        return next
      })
    } catch {
      // mutation's onError already toasted
    }
  }

  async function acceptAll(): Promise<void> {
    for (const { s, idx } of visibleSuggestions) {
      await acceptSuggestion(s, idx)
    }
  }

  function rejectSuggestion(idx: number): void {
    setDismissedIdx((prev) => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
  }

  // ─── Render ───

  // Available filter dropdown options derived from the raw data.
  const availableStatuses = useMemo(
    () => Array.from(new Set(documents.map((d) => d.status))).sort(),
    [documents],
  )
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>()
    for (const d of documents) set.add(d.currencyCode)
    for (const tx of transactions) if (tx.currencyCode) set.add(tx.currencyCode)
    return Array.from(set).sort()
  }, [documents, transactions])

  const dateFromMs = filterDateFrom ? new Date(filterDateFrom).getTime() : null
  const dateToMs = filterDateTo ? new Date(`${filterDateTo}T23:59:59`).getTime() : null
  const searchNeedle = filterSearch.trim().toLowerCase()

  function docMatches(d: ReconcileDoc): boolean {
    if (filterStatus !== "all" && d.status !== filterStatus) return false
    if (filterCurrency !== "all" && d.currencyCode !== filterCurrency) return false
    if (dateFromMs !== null && d.issueDate.getTime() < dateFromMs) return false
    if (dateToMs !== null && d.issueDate.getTime() > dateToMs) return false
    if (searchNeedle) {
      const hay = [d.number, d.contactName ?? "", d.notes ?? ""]
        .join(" ")
        .toLowerCase()
      if (!hay.includes(searchNeedle)) return false
    }
    return true
  }

  function txMatches(t: ReconcileTx): boolean {
    if (filterCurrency !== "all" && t.currencyCode !== filterCurrency) return false
    if (t.issuedAt) {
      const ms = t.issuedAt.getTime()
      if (dateFromMs !== null && ms < dateFromMs) return false
      if (dateToMs !== null && ms > dateToMs) return false
    }
    if (searchNeedle) {
      const hay = [
        t.name ?? "",
        t.merchant ?? "",
        t.description ?? "",
        t.note ?? "",
        t.accountName ?? "",
        t.categoryCode ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!hay.includes(searchNeedle)) return false
    }
    return true
  }

  const filterActive =
    filterSearch.length > 0 ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    filterStatus !== "all" ||
    filterCurrency !== "all"

  const invoiceDocs = documents.filter((d) => d.kind === "invoice" && docMatches(d))
  const purchaseDocs = documents.filter((d) => d.kind === "purchase" && docMatches(d))
  const incomeTx = transactions.filter((t) => t.type === "income" && txMatches(t))
  const expenseTx = transactions.filter((t) => t.type === "expense" && txMatches(t))

  const links = linksQuery.data ?? []
  // For linked pairs, a row passes if EITHER side matches the filter. Users
  // expect "show me pairs involving X" to find the pair regardless of which
  // leg mentions X.
  function linkedPairMatches(p: LinkedPair): boolean {
    if (filterStatus !== "all") {
      // Linked pairs carry no doc status in the payload; skip status filtering
      // for linked tabs (no visible breakage — just no-op).
    }
    if (filterCurrency !== "all") {
      if (
        p.documentCurrencyCode !== filterCurrency &&
        p.transactionCurrencyCode !== filterCurrency
      ) {
        return false
      }
    }
    const docMs = p.documentIssueDate.getTime()
    const txMs = p.transactionIssuedAt?.getTime() ?? null
    if (dateFromMs !== null && docMs < dateFromMs && (txMs === null || txMs < dateFromMs)) {
      return false
    }
    if (dateToMs !== null && docMs > dateToMs && (txMs === null || txMs > dateToMs)) {
      return false
    }
    if (searchNeedle) {
      const hay = [
        p.documentNumber,
        p.documentContactName ?? "",
        p.transactionName ?? "",
        p.transactionMerchant ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!hay.includes(searchNeedle)) return false
    }
    return true
  }
  const linkedInvoicePairs = links.filter(
    (l) => l.documentKind === "invoice" && linkedPairMatches(l),
  )
  const linkedPurchasePairs = links.filter(
    (l) => l.documentKind === "purchase" && linkedPairMatches(l),
  )

  async function onUnlinkPair(pair: LinkedPair): Promise<void> {
    const ok = await confirmDialog({
      title: t("reconcile.unlinkConfirmTitle", {
        defaultValue: "Unlink allocation?",
      }),
      description: t("reconcile.unlinkConfirmDesc", {
        number: pair.documentNumber,
        defaultValue:
          "Remove the link between this transaction and {number}? The document keeps existing; only the allocation is deleted.",
      }),
      confirmLabel: t("reconcile.unlink", { defaultValue: "Unlink" }),
      variant: "destructive",
    })
    if (!ok) return
    unallocate.mutate({
      paymentId: pair.paymentId,
      documentKind: pair.documentKind,
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="mx-auto w-full max-w-7xl space-y-4 py-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("reconcile.title", { defaultValue: "Reconcile" })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reconcile.subtitleV2", {
                defaultValue:
                  "Drag an invoice or purchase onto the transaction that settled it, or let AI propose matches. Cash deposits and aggregated cash payouts are supported.",
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onResyncPaid}
              disabled={resyncPaid.isPending}
              title={t("reconcile.resync.tooltip", {
                defaultValue:
                  "Revert invoices/purchases marked 'paid' but with zero linked payments (e.g. after deleting the transactions they were matched to).",
              })}
            >
              {resyncPaid.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              {t("reconcile.resync.trigger", { defaultValue: "Reset stale paid" })}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSnapTotals}
              disabled={snapTotals.isPending}
              title={t("reconcile.snap.tooltip", {
                defaultValue:
                  "For every paid document where the stored total drifts < €1 from what was actually paid, adopt the paid amount as the printed total.",
              })}
            >
              {snapTotals.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="mr-1.5 h-4 w-4" />
              )}
              {t("reconcile.snap.trigger", { defaultValue: "Fix drifted totals" })}
            </Button>
            <Button
              type="button"
              onClick={() => aiMatch.mutate({})}
              disabled={aiMatch.isPending || documents.length === 0 || transactions.length === 0}
            >
              {aiMatch.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              {aiMatch.isPending
                ? t("reconcile.analyzing")
                : t("reconcile.analyzeWithAi")}
            </Button>
          </div>
        </header>

        {aiMatch.error && <p className="text-sm text-destructive">{aiMatch.error.message}</p>}

        {visibleSuggestions.length > 0 && (
          <section className="space-y-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {t("reconcile.suggestions", { count: visibleSuggestions.length })}
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={acceptAll}
                disabled={allocate.isPending}
              >
                {t("reconcile.acceptAll")}
              </Button>
            </div>
            <ul className="space-y-1.5">
              {visibleSuggestions.map(({ s, idx }) => {
                const doc = docsById.get(s.documentId)
                const tx = txById.get(s.transactionId)
                if (!doc || !tx) return null
                const accent = DOC_ACCENT[doc.kind]
                return (
                  <li
                    key={idx}
                    className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("text-[11px] border-transparent", accent.chip)}
                        >
                          {doc.number}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                        <span className="truncate">
                          {tx.name || tx.merchant || tx.id.slice(0, 8)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] border-transparent", confidenceColor(s.confidence))}
                        >
                          {Math.round(s.confidence * 100)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap font-medium">
                        {formatCurrency(s.amountCents, tx.currencyCode ?? doc.currencyCode)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => rejectSuggestion(idx)}
                      >
                        {t("reconcile.reject")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => acceptSuggestion(s, idx)}
                        disabled={allocate.isPending}
                      >
                        {t("reconcile.accept")}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ── Filter bar ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder={t("reconcile.filters.searchPlaceholder", {
                defaultValue: "Search number, contact, transaction…",
              })}
              className="h-9 pl-7"
            />
          </div>
          <DateRangePresetFilter
            value={{ from: filterDateFrom, to: filterDateTo }}
            onChange={(r) => {
              setFilterDateFrom(r.from)
              setFilterDateTo(r.to)
            }}
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder={t("reconcile.filters.status", { defaultValue: "Status" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("reconcile.filters.allStatuses", { defaultValue: "All statuses" })}
              </SelectItem>
              {availableStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableCurrencies.length > 1 ? (
            <Select value={filterCurrency} onValueChange={setFilterCurrency}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("reconcile.filters.allCurrencies", { defaultValue: "All currencies" })}
                </SelectItem>
                {availableCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {filterActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterSearch("")
                setFilterDateFrom("")
                setFilterDateTo("")
                setFilterStatus("all")
                setFilterCurrency("all")
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {t("reconcile.filters.clear", { defaultValue: "Clear filters" })}
            </Button>
          ) : null}
        </div>

        {/* ── Tab bar ──────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1 border-b">
          <TabButton
            active={activeTab === "invoices"}
            onClick={() => setActiveTab("invoices")}
            accent="emerald"
            icon={<ArrowDownLeft className="h-4 w-4" />}
            label={t("reconcile.tabs.invoices", {
              defaultValue: "Invoices · Money in",
            })}
            count={invoiceDocs.length + incomeTx.length}
          />
          <TabButton
            active={activeTab === "purchases"}
            onClick={() => setActiveTab("purchases")}
            accent="rose"
            icon={<ArrowUpRight className="h-4 w-4" />}
            label={t("reconcile.tabs.purchases", {
              defaultValue: "Purchases · Money out",
            })}
            count={purchaseDocs.length + expenseTx.length}
          />
          <TabButton
            active={activeTab === "linkedInvoices"}
            onClick={() => setActiveTab("linkedInvoices")}
            accent="emerald"
            icon={<Link2 className="h-4 w-4" />}
            label={t("reconcile.tabs.linkedInvoices", {
              defaultValue: "Linked invoices",
            })}
            count={linkedInvoicePairs.length}
          />
          <TabButton
            active={activeTab === "linkedPurchases"}
            onClick={() => setActiveTab("linkedPurchases")}
            accent="rose"
            icon={<Link2 className="h-4 w-4" />}
            label={t("reconcile.tabs.linkedPurchases", {
              defaultValue: "Linked purchases",
            })}
            count={linkedPurchasePairs.length}
          />
        </div>

        {activeTab === "invoices" && (
          <TabPanel
            isLoading={isLoading}
            activeDrag={activeDrag}
            canPair={canPair}
            documents={invoiceDocs}
            primaryTx={incomeTx}
            refundTx={expenseTx}
            primaryTxTitle={t("reconcile.incomeSub", { defaultValue: "Money in" })}
            primaryTxIcon={<ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            primaryTxEmpty={t("reconcile.noIncomeTx", { defaultValue: "No unallocated income." })}
            refundsTitle={t("reconcile.refundsExpense", {
              defaultValue: "Refunds (money out)",
            })}
            refundsHint={t("reconcile.refundsInvoiceHint", {
              defaultValue:
                "Paying a client back? Drag an invoice here to record the refund.",
            })}
            docsTitle={t("reconcile.invoicesSub", { defaultValue: "Invoices (income)" })}
            docsIcon={<ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            docsEmpty={t("reconcile.noUnpaidInvoices")}
          />
        )}
        {activeTab === "purchases" && (
          <TabPanel
            isLoading={isLoading}
            activeDrag={activeDrag}
            canPair={canPair}
            documents={purchaseDocs}
            primaryTx={expenseTx}
            refundTx={incomeTx}
            primaryTxTitle={t("reconcile.expenseSub", { defaultValue: "Money out" })}
            primaryTxIcon={<ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
            primaryTxEmpty={t("reconcile.noExpenseTx", { defaultValue: "No unallocated expenses." })}
            refundsTitle={t("reconcile.refundsIncome", {
              defaultValue: "Refunds (money in)",
            })}
            refundsHint={t("reconcile.refundsPurchaseHint", {
              defaultValue:
                "A supplier paid you back? Drag a refunded purchase onto the matching income transaction.",
            })}
            docsTitle={t("reconcile.purchasesSub", { defaultValue: "Purchases (expense)" })}
            docsIcon={<ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
            docsEmpty={t("reconcile.noUnpaidPurchases", {
              defaultValue: "No unpaid purchases.",
            })}
          />
        )}
        {activeTab === "linkedInvoices" && (
          <LinkedTabPanel
            pairs={linkedInvoicePairs}
            isLoading={linksQuery.isLoading}
            onUnlink={onUnlinkPair}
            onUpdateAmount={(pair, amountCents) =>
              updateAmount.mutate({
                paymentId: pair.paymentId,
                documentKind: pair.documentKind,
                amountCents,
              })
            }
            unlinkingPaymentId={unallocate.isPending ? unallocate.variables?.paymentId ?? null : null}
            updatingPaymentId={updateAmount.isPending ? updateAmount.variables?.paymentId ?? null : null}
            emptyLabel={t("reconcile.noLinkedInvoices", {
              defaultValue: "No invoices linked to transactions yet.",
            })}
          />
        )}
        {activeTab === "linkedPurchases" && (
          <LinkedTabPanel
            pairs={linkedPurchasePairs}
            isLoading={linksQuery.isLoading}
            onUnlink={onUnlinkPair}
            onUpdateAmount={(pair, amountCents) =>
              updateAmount.mutate({
                paymentId: pair.paymentId,
                documentKind: pair.documentKind,
                amountCents,
              })
            }
            unlinkingPaymentId={unallocate.isPending ? unallocate.variables?.paymentId ?? null : null}
            updatingPaymentId={updateAmount.isPending ? updateAmount.variables?.paymentId ?? null : null}
            emptyLabel={t("reconcile.noLinkedPurchases", {
              defaultValue: "No purchases linked to transactions yet.",
            })}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DocumentCard doc={activeDrag} compact highlight /> : null}
      </DragOverlay>
    </DndContext>
  )
}

/** How far off the allocated amount can be from the document total before we
 *  flag it as a rounding discrepancy. Partial payments (cash aggregation,
 *  half-paid invoices) can legitimately differ by more than this. A few-cent
 *  drift between printed total and reconstructed total, however, means the
 *  import lost precision — that's what we want to surface. */
const DISCREPANCY_THRESHOLD_CENTS = 100 // €1.00

/** Returns "off" when the allocated amount differs from the doc total by a
 *  small amount (rounding drift), "exact" when they match, "partial" when it's
 *  a deliberate partial payment. Used for row highlighting. */
function allocationStatus(
  amountCents: number,
  documentTotalCents: number,
): "exact" | "drift" | "partial" {
  const diff = Math.abs(amountCents - documentTotalCents)
  if (diff === 0) return "exact"
  if (diff <= DISCREPANCY_THRESHOLD_CENTS) return "drift"
  return "partial"
}

/** Group allocations by transaction so cash-deposit cases (one tx covering
 *  multiple invoices/purchases) render as a tree instead of N floating rows. */
function groupPairsByTransaction(pairs: LinkedPair[]): Array<{
  transactionId: string
  pairs: LinkedPair[]
}> {
  const byTx = new Map<string, LinkedPair[]>()
  for (const pair of pairs) {
    const existing = byTx.get(pair.transactionId) ?? []
    existing.push(pair)
    byTx.set(pair.transactionId, existing)
  }
  const groups: Array<{ transactionId: string; pairs: LinkedPair[] }> = []
  for (const [transactionId, groupPairs] of byTx) {
    groups.push({ transactionId, pairs: groupPairs })
  }
  // Sort: newest allocation in the group first (same sort order as the flat
  // list so toggling group/flat doesn't jumble the page).
  groups.sort((a, b) => {
    const ta = Math.max(...a.pairs.map((p) => p.createdAt.getTime()))
    const tb = Math.max(...b.pairs.map((p) => p.createdAt.getTime()))
    return tb - ta
  })
  return groups
}

function LinkedTabPanel({
  pairs,
  isLoading,
  onUnlink,
  onUpdateAmount,
  unlinkingPaymentId,
  updatingPaymentId,
  emptyLabel,
}: {
  pairs: LinkedPair[]
  isLoading: boolean
  onUnlink: (pair: LinkedPair) => void | Promise<void>
  onUpdateAmount: (pair: LinkedPair, amountCents: number) => void
  unlinkingPaymentId: string | null
  updatingPaymentId: string | null
  emptyLabel: string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (pairs.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  const groups = groupPairsByTransaction(pairs)

  return (
    <ul className="space-y-2">
      {groups.map((group) => {
        if (group.pairs.length === 1) {
          const pair = group.pairs[0]!
          return (
            <LinkedPairRow
              key={pair.paymentId}
              pair={pair}
              onUnlink={() => onUnlink(pair)}
              onUpdateAmount={(amountCents) => onUpdateAmount(pair, amountCents)}
              isUnlinking={unlinkingPaymentId === pair.paymentId}
              isUpdating={updatingPaymentId === pair.paymentId}
            />
          )
        }
        return (
          <LinkedGroupCard
            key={group.transactionId}
            pairs={group.pairs}
            onUnlink={onUnlink}
            onUpdateAmount={onUpdateAmount}
            unlinkingPaymentId={unlinkingPaymentId}
            updatingPaymentId={updatingPaymentId}
          />
        )
      })}
    </ul>
  )
}

/** Rendered when one transaction has multiple allocations — shows the
 *  transaction once at the top, then nests the documents beneath. Helps users
 *  review the cash-deposit pattern (one bank line → multiple receipts). */
function LinkedGroupCard({
  pairs,
  onUnlink,
  onUpdateAmount,
  unlinkingPaymentId,
  updatingPaymentId,
}: {
  pairs: LinkedPair[]
  onUnlink: (pair: LinkedPair) => void | Promise<void>
  onUpdateAmount: (pair: LinkedPair, amountCents: number) => void
  unlinkingPaymentId: string | null
  updatingPaymentId: string | null
}) {
  const { t } = useTranslation("invoices")
  const head = pairs[0]!
  const totalAllocated = pairs.reduce((s, p) => s + p.amountCents, 0)
  const currency = head.transactionCurrencyCode ?? head.documentCurrencyCode
  const txTotal = head.transactionTotalCents
  const unallocated = Math.max(txTotal - totalAllocated, 0)
  const fullyAllocated = unallocated === 0

  return (
    <li className="rounded-md border bg-muted/30">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background/40 px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            href={`/transactions/${head.transactionId}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {head.transactionName ||
              head.transactionMerchant ||
              head.transactionId.slice(0, 8)}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {head.transactionIssuedAt
              ? format(head.transactionIssuedAt, "yyyy-MM-dd")
              : "—"}
            {" · "}
            {formatCurrency(txTotal, currency)}
            {" · "}
            {t("reconcile.groupDocCount", {
              count: pairs.length,
              defaultValue: "{count} documents",
            })}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div
            className={cn(
              "font-medium",
              fullyAllocated ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
            )}
          >
            {formatCurrency(totalAllocated, currency)}
            <span className="ml-1 text-muted-foreground">
              / {formatCurrency(txTotal, currency)}
            </span>
          </div>
          {!fullyAllocated && (
            <div className="text-[11px] text-muted-foreground">
              {t("reconcile.groupUnallocated", {
                amount: formatCurrency(unallocated, currency),
                defaultValue: "{amount} left",
              })}
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y">
        {pairs.map((pair) => (
          <LinkedDocChildRow
            key={pair.paymentId}
            pair={pair}
            onUnlink={() => onUnlink(pair)}
            onUpdateAmount={(amountCents) => onUpdateAmount(pair, amountCents)}
            isUnlinking={unlinkingPaymentId === pair.paymentId}
            isUpdating={updatingPaymentId === pair.paymentId}
          />
        ))}
      </ul>
    </li>
  )
}

function LinkedPairRow({
  pair,
  onUnlink,
  onUpdateAmount,
  isUnlinking,
  isUpdating,
}: {
  pair: LinkedPair
  onUnlink: () => void
  onUpdateAmount: (amountCents: number) => void
  isUnlinking: boolean
  isUpdating: boolean
}) {
  const { t } = useTranslation("invoices")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>((pair.amountCents / 100).toFixed(2))

  const accent = DOC_ACCENT[pair.documentKind]
  const DocIcon = pair.documentKind === "invoice" ? FileText : Receipt
  const docHref =
    pair.documentKind === "invoice"
      ? `/invoices/${pair.documentId}`
      : `/purchases/${pair.documentId}`
  const txHref = `/transactions/${pair.transactionId}`

  const status = allocationStatus(pair.amountCents, pair.documentTotalCents)
  const isPartial = status !== "exact"
  const driftAmount = pair.documentTotalCents - pair.amountCents

  function beginEdit(): void {
    setDraft((pair.amountCents / 100).toFixed(2))
    setEditing(true)
  }
  function cancelEdit(): void {
    setEditing(false)
  }
  function saveEdit(): void {
    const euros = Number.parseFloat(draft)
    if (!Number.isFinite(euros) || euros <= 0) return
    const cents = Math.round(euros * 100)
    if (cents === pair.amountCents) {
      setEditing(false)
      return
    }
    onUpdateAmount(cents)
    setEditing(false)
  }

  return (
    <li
      className={cn(
        "relative flex flex-col gap-3 rounded-md border bg-background px-3 py-2 pl-4 md:flex-row md:items-center",
        status === "drift" &&
          "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
      )}
    >
      <div
        className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-md", accent.bar)}
        aria-hidden
      />

      {/* Document side */}
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <DocIcon className={cn("mt-0.5 h-4 w-4 shrink-0", accent.icon)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={docHref}
              className="truncate text-sm font-medium hover:underline"
            >
              {pair.documentNumber}
            </Link>
            <Badge
              variant="outline"
              className={cn("text-[10px] border-transparent", accent.chip)}
            >
              {pair.documentKind === "invoice"
                ? t("reconcile.kindInvoice", { defaultValue: "Invoice" })
                : t("reconcile.kindPurchase", { defaultValue: "Purchase" })}
            </Badge>
            {pair.source === "ai" && (
              <Badge variant="outline" className="text-[10px]">AI</Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {pair.documentContactName ?? "—"} · {format(pair.documentIssueDate, "yyyy-MM-dd")}
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="hidden text-muted-foreground md:block">→</div>

      {/* Transaction side */}
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            href={txHref}
            className="block truncate text-sm font-medium hover:underline"
          >
            {pair.transactionName || pair.transactionMerchant || pair.transactionId.slice(0, 8)}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {pair.transactionIssuedAt ? format(pair.transactionIssuedAt, "yyyy-MM-dd") : "—"}
            {" · "}
            {formatCurrency(pair.transactionTotalCents, pair.transactionCurrencyCode ?? "EUR")}
          </div>
        </div>
      </div>

      {/* Amount + actions */}
      <div className="flex shrink-0 items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit()
                if (e.key === "Escape") cancelEdit()
              }}
              className="h-8 w-28"
              autoFocus
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={saveEdit}
              aria-label={t("reconcile.saveAmount", { defaultValue: "Save" })}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={cancelEdit}
              aria-label={t("reconcile.cancelEdit", { defaultValue: "Cancel" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-medium",
                  status === "drift" && "text-amber-700 dark:text-amber-400",
                )}
                title={status === "drift"
                  ? t("reconcile.driftTooltip", {
                      diff: formatCurrency(Math.abs(driftAmount), pair.documentCurrencyCode),
                      defaultValue: "Amount is {diff} off from the document total — likely rounding drift.",
                    })
                  : undefined}
              >
                {formatCurrency(pair.amountCents, pair.documentCurrencyCode)}
              </div>
              {isPartial && (
                <div className={cn(
                  "text-[11px]",
                  status === "drift" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                )}>
                  {status === "drift"
                    ? t("reconcile.driftOf", {
                        total: formatCurrency(pair.documentTotalCents, pair.documentCurrencyCode),
                        defaultValue: "off from {total}",
                      })
                    : t("reconcile.partialOf", {
                        total: formatCurrency(pair.documentTotalCents, pair.documentCurrencyCode),
                        defaultValue: "of {total}",
                      })}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={beginEdit}
              disabled={isUpdating}
              aria-label={t("reconcile.editAmount", { defaultValue: "Edit amount" })}
              title={t("reconcile.editAmount", { defaultValue: "Edit amount" })}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onUnlink}
              disabled={isUnlinking}
              aria-label={t("reconcile.unlink", { defaultValue: "Unlink" })}
              title={t("reconcile.unlink", { defaultValue: "Unlink" })}
            >
              {isUnlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

/** Compact per-document row shown inside a LinkedGroupCard. Skips the
 *  transaction-side repetition since the parent already shows it once. */
function LinkedDocChildRow({
  pair,
  onUnlink,
  onUpdateAmount,
  isUnlinking,
  isUpdating,
}: {
  pair: LinkedPair
  onUnlink: () => void
  onUpdateAmount: (amountCents: number) => void
  isUnlinking: boolean
  isUpdating: boolean
}) {
  const { t } = useTranslation("invoices")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>((pair.amountCents / 100).toFixed(2))

  const accent = DOC_ACCENT[pair.documentKind]
  const DocIcon = pair.documentKind === "invoice" ? FileText : Receipt
  const docHref =
    pair.documentKind === "invoice"
      ? `/invoices/${pair.documentId}`
      : `/purchases/${pair.documentId}`

  const status = allocationStatus(pair.amountCents, pair.documentTotalCents)
  const isPartial = status !== "exact"
  const driftAmount = pair.documentTotalCents - pair.amountCents

  function beginEdit(): void {
    setDraft((pair.amountCents / 100).toFixed(2))
    setEditing(true)
  }
  function cancelEdit(): void {
    setEditing(false)
  }
  function saveEdit(): void {
    const euros = Number.parseFloat(draft)
    if (!Number.isFinite(euros) || euros <= 0) return
    const cents = Math.round(euros * 100)
    if (cents === pair.amountCents) {
      setEditing(false)
      return
    }
    onUpdateAmount(cents)
    setEditing(false)
  }

  return (
    <li
      className={cn(
        "relative flex items-center gap-2 bg-background px-3 py-2 pl-6",
        status === "drift" && "bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      {/* Subtle tree connector */}
      <span
        className="absolute left-3 top-0 h-full w-px bg-border"
        aria-hidden
      />
      <span
        className={cn("absolute left-3 top-1/2 h-px w-3", accent.bar.replace("/70", "/40"))}
        aria-hidden
      />

      <DocIcon className={cn("h-4 w-4 shrink-0", accent.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={docHref}
            className="truncate text-sm font-medium hover:underline"
          >
            {pair.documentNumber}
          </Link>
          <Badge
            variant="outline"
            className={cn("text-[10px] border-transparent", accent.chip)}
          >
            {pair.documentKind === "invoice"
              ? t("reconcile.kindInvoice", { defaultValue: "Invoice" })
              : t("reconcile.kindPurchase", { defaultValue: "Purchase" })}
          </Badge>
          {pair.source === "ai" && (
            <Badge variant="outline" className="text-[10px]">AI</Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {pair.documentContactName ?? "—"} ·{" "}
          {format(pair.documentIssueDate, "yyyy-MM-dd")}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit()
                if (e.key === "Escape") cancelEdit()
              }}
              className="h-8 w-24"
              autoFocus
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={saveEdit}
              aria-label={t("reconcile.saveAmount", { defaultValue: "Save" })}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={cancelEdit}
              aria-label={t("reconcile.cancelEdit", { defaultValue: "Cancel" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-medium",
                  status === "drift" && "text-amber-700 dark:text-amber-400",
                )}
                title={status === "drift"
                  ? t("reconcile.driftTooltip", {
                      diff: formatCurrency(Math.abs(driftAmount), pair.documentCurrencyCode),
                      defaultValue: "Amount is {diff} off from the document total — likely rounding drift.",
                    })
                  : undefined}
              >
                {formatCurrency(pair.amountCents, pair.documentCurrencyCode)}
              </div>
              {isPartial && (
                <div className={cn(
                  "text-[11px]",
                  status === "drift" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                )}>
                  {status === "drift"
                    ? t("reconcile.driftOf", {
                        total: formatCurrency(pair.documentTotalCents, pair.documentCurrencyCode),
                        defaultValue: "off from {total}",
                      })
                    : t("reconcile.partialOf", {
                        total: formatCurrency(pair.documentTotalCents, pair.documentCurrencyCode),
                        defaultValue: "of {total}",
                      })}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={beginEdit}
              disabled={isUpdating}
              aria-label={t("reconcile.editAmount", { defaultValue: "Edit amount" })}
              title={t("reconcile.editAmount", { defaultValue: "Edit amount" })}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onUnlink}
              disabled={isUnlinking}
              aria-label={t("reconcile.unlink", { defaultValue: "Unlink" })}
              title={t("reconcile.unlink", { defaultValue: "Unlink" })}
            >
              {isUnlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function TabButton({
  active,
  onClick,
  accent,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  accent: "emerald" | "rose"
  icon: React.ReactNode
  label: string
  count: number
}) {
  const activeColor =
    accent === "emerald"
      ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
      : "border-rose-500 text-rose-700 dark:text-rose-400"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? activeColor
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </button>
  )
}

function TabPanel({
  isLoading,
  activeDrag,
  canPair,
  documents,
  primaryTx,
  refundTx,
  primaryTxTitle,
  primaryTxIcon,
  primaryTxEmpty,
  refundsTitle,
  refundsHint,
  docsTitle,
  docsIcon,
  docsEmpty,
}: {
  isLoading: boolean
  activeDrag: ReconcileDoc | null
  canPair: (doc: ReconcileDoc, tx: ReconcileTx) => boolean
  documents: ReconcileDoc[]
  primaryTx: ReconcileTx[]
  refundTx: ReconcileTx[]
  primaryTxTitle: string
  primaryTxIcon: React.ReactNode
  primaryTxEmpty: string
  refundsTitle: string
  refundsHint: string
  docsTitle: string
  docsIcon: React.ReactNode
  docsEmpty: string
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Documents column ─────────────────────────────── */}
      <section className="space-y-3">
        <SubList
          title={docsTitle}
          icon={docsIcon}
          emptyLabel={docsEmpty}
          isLoading={isLoading}
          items={documents.map((doc) => <DraggableDocument key={doc.id} doc={doc} />)}
        />
      </section>

      {/* ── Transactions column ──────────────────────────── */}
      <section className="space-y-3">
        <SubList
          title={primaryTxTitle}
          icon={primaryTxIcon}
          emptyLabel={primaryTxEmpty}
          isLoading={isLoading}
          items={primaryTx.map((tx) => (
            <TransactionDropTarget
              key={tx.id}
              tx={tx}
              active={activeDrag !== null}
              accepts={activeDrag ? canPair(activeDrag, tx) : true}
            >
              <TransactionRow tx={tx} />
            </TransactionDropTarget>
          ))}
        />
        {refundTx.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {refundsTitle}
              </div>
              <div className="text-[11px] text-muted-foreground">
                ({refundTx.length})
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{refundsHint}</p>
            <div className="space-y-1.5">
              {refundTx.map((tx) => (
                <TransactionDropTarget
                  key={tx.id}
                  tx={tx}
                  active={activeDrag !== null}
                  accepts={activeDrag ? canPair(activeDrag, tx) : true}
                >
                  <TransactionRow tx={tx} />
                </TransactionDropTarget>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SubList({
  title,
  icon,
  items,
  isLoading,
  emptyLabel,
}: {
  title: string
  icon: React.ReactNode
  items: React.ReactNode[]
  isLoading: boolean
  emptyLabel: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {isLoading ? (
        <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-1.5">{items}</div>
      )}
    </div>
  )
}

function TransactionRow({ tx }: { tx: ReconcileTx }) {
  const [expanded, setExpanded] = useState(false)
  const unallocated = Math.max(tx.totalCents - tx.allocatedCents, 0)
  const description = tx.description?.trim() || null
  const note = tx.note?.trim() || null
  const merchantSecondary = tx.merchant && tx.name ? tx.merchant : null
  const hasExtra = Boolean(description || note || merchantSecondary || tx.categoryCode || tx.accountName)

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2",
        hasExtra && "cursor-pointer",
      )}
      onClick={hasExtra ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="truncate text-sm font-medium">
          {tx.name || tx.merchant || tx.id.slice(0, 8)}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {tx.issuedAt ? (
            <span className="tabular-nums">{format(tx.issuedAt, "yyyy-MM-dd")}</span>
          ) : (
            <span>—</span>
          )}
          {merchantSecondary ? <span>· {merchantSecondary}</span> : null}
          {tx.accountName ? (
            <span className="inline-flex items-center gap-1">
              ·
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground/80">
                {tx.accountName}
              </span>
            </span>
          ) : null}
          {tx.categoryCode ? (
            <span className="inline-flex items-center gap-1">
              ·
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground/80">
                {tx.categoryCode}
              </span>
            </span>
          ) : null}
          {tx.status && tx.status !== "business" ? (
            <span className="inline-flex items-center gap-1">
              ·
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground/80">
                {tx.status}
              </span>
            </span>
          ) : null}
        </div>
        {description && !expanded ? (
          <div
            className="truncate text-[11px] text-muted-foreground/80"
            title={description}
          >
            {description}
          </div>
        ) : null}
        {expanded && (description || note) ? (
          <div className="mt-1 space-y-1 rounded-md border border-border/40 bg-muted/20 p-2 text-[11px]">
            {description ? (
              <div className="whitespace-pre-wrap break-words text-foreground/80">
                {description}
              </div>
            ) : null}
            {note ? (
              <div className="whitespace-pre-wrap break-words text-foreground/70 border-t border-border/40 pt-1">
                <span className="text-muted-foreground/70">Note: </span>
                {note}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-medium">
          {formatCurrency(unallocated, tx.currencyCode ?? "EUR")}
        </div>
        {tx.allocatedCents > 0 && (
          <div className="text-[11px] text-muted-foreground">
            of {formatCurrency(tx.totalCents, tx.currencyCode ?? "EUR")}
          </div>
        )}
      </div>
    </div>
  )
}
