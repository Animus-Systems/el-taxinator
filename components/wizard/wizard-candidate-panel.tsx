import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle, ArrowLeftRight, Check, CopyX, EyeOff, Landmark, Sparkles } from "lucide-react"
import type { TransactionCandidate } from "@/ai/import-csv"
import { cn, formatCurrency } from "@/lib/utils"
import { summarizeImportCandidates, effectiveReviewStatus } from "@/lib/import-review"
import { getLocalizedValue } from "@/lib/i18n-db"
import { trpc } from "~/trpc"

// Sentinel value used by the counter-account picker to represent "no account
// in Taxinator — the other side is external or not tracked here". Radix's
// Select doesn't accept an empty string as an item value, so we use this
// opaque string and translate it to `null` before calling the mutation.
const EXTERNAL_COUNTERPARTY = "__external__"

type Props = {
  sessionId: string
  candidates: TransactionCandidate[]
}

/**
 *  Direction prefix for a candidate amount. Mirrors the transactions-list
 *  helper: `total` is stored positive (cents), the sign is derived from type
 *  and, for transfers, the direction. Exchange legs and `other` rows stay
 *  neutral since they have no intrinsic direction here.
 */
function candidateSignPrefix(c: TransactionCandidate): "+" | "−" | "" {
  const value = c.total ?? 0
  if (value < 0) return "−"
  if (value > 0) {
    if (c.type === "income") return "+"
    if (c.type === "expense") return "−"
    if (c.type === "refund") return "+"
    if (c.type === "transfer") {
      if (c.transferDirection === "outgoing") return "−"
      if (c.transferDirection === "incoming") return "+"
      return ""
    }
  }
  return ""
}

function formatLegSummary(c?: TransactionCandidate | null): string {
  if (!c) return "—"
  const parts: string[] = []
  if (c.merchant) parts.push(c.merchant)
  if (c.total !== null && c.currencyCode) {
    const prefix = candidateSignPrefix(c)
    parts.push(`${prefix}${formatCurrency(Math.abs(c.total), c.currencyCode)}`)
  }
  return parts.join(" · ") || "—"
}

type StatusKey =
  | "needs_review"
  | "business"
  | "business_non_deductible"
  | "personal_taxable"
  | "personal_ignored"
  | "internal"
type FilterKey = "all" | StatusKey

const STATUS_DOT: Record<string, string> = {
  business: "bg-emerald-500",
  business_non_deductible: "bg-amber-500",
  personal_taxable: "bg-amber-500/70",
  personal_ignored: "bg-muted-foreground/30",
  internal: "bg-sky-500",
  needs_review: "bg-rose-500",
}

const STATUS_LABEL: Record<string, string> = {
  business: "Business",
  business_non_deductible: "Non-deductible",
  personal_taxable: "Personal (taxable)",
  personal_ignored: "Personal (ignored)",
  internal: "Internal",
  needs_review: "Needs review",
}

const FILTER_ORDER: FilterKey[] = [
  "all",
  "needs_review",
  "business",
  "business_non_deductible",
  "personal_taxable",
  "personal_ignored",
  "internal",
]

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  needs_review: "Needs review",
  business: "Business",
  business_non_deductible: "Non-deductible",
  personal_taxable: "Personal (taxable)",
  personal_ignored: "Personal (ignored)",
  internal: "Internal",
}

// Sort priority: needs_review at top, internal at bottom (least interesting).
const SORT_PRIORITY: Record<string, number> = {
  needs_review: 0,
  business_non_deductible: 1,
  business: 2,
  personal_taxable: 3,
  personal_ignored: 4,
  internal: 5,
}

type AccountInfo = { name: string; bankName: string | null }

type AnalysisEntry = {
  reasoning: string | null
  provider: string
  model: string | null
  createdAt: Date
}

const PAGE_SIZE = 50

export function WizardCandidatePanel({ sessionId, candidates }: Props) {
  const { t, i18n } = useTranslation("wizard")
  const locale = i18n.language || "en"
  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
  const { data: categories = [] } = trpc.categories.list.useQuery({})
  const { data: projects = [] } = trpc.projects.list.useQuery({})
  const { data: analysisByRow = {} } = trpc.wizard.analysisForSession.useQuery({ sessionId })
  const accountById = new Map<string, AccountInfo>(
    accounts.map((a) => [a.id, { name: a.name, bankName: a.bankName ?? null }]),
  )

  const [filter, setFilter] = useState<FilterKey>("all")
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [includeDeferred, setIncludeDeferred] = useState(false)
  const [pendingLinkRow, setPendingLinkRow] = useState<number | null>(null)
  // Per-row user choice for an orphan transfer's counter-account. Keyed by
  // rowIndex. Values are either an account id or `EXTERNAL_COUNTERPARTY`.
  const [pickedCounterAccountId, setPickedCounterAccountId] = useState<
    Record<number, string>
  >({})
  const utils = trpc.useUtils()
  const applyTransferLink = trpc.wizard.applyTransferLink.useMutation({
    onSuccess: () => {
      utils.wizard.get.invalidate()
    },
  })
  const dismissTransferLink = trpc.wizard.dismissTransferLink.useMutation({
    onSuccess: () => {
      utils.wizard.get.invalidate()
    },
  })
  const setCandidateSelected = trpc.wizard.setCandidateSelected.useMutation({
    onSuccess: () => {
      utils.wizard.get.invalidate()
    },
  })

  const updateCandidate = trpc.wizard.updateCandidate.useMutation({
    onSuccess: () => {
      utils.wizard.get.invalidate()
    },
  })

  const handleToggleSelected = (c: TransactionCandidate, next: boolean) => {
    setCandidateSelected.mutate({
      sessionId,
      rowIndex: c.rowIndex,
      selected: next,
    })
  }

  const handleConfirmTransfer = async (c: TransactionCandidate) => {
    const link = c.extra?.proposedTransferLink
    if (!link) return
    setPendingLinkRow(c.rowIndex)
    try {
      // Orphan-only: resolve the counter-account from the per-row pick,
      // falling back to the AI's suggestion if the user didn't change the
      // default. `EXTERNAL_COUNTERPARTY` maps to null (no in-Taxinator leg).
      const picked =
        link.rowIndexB === null
          ? pickedCounterAccountId[c.rowIndex] ?? link.counterAccountId ?? null
          : null
      const counterAccountId =
        picked === EXTERNAL_COUNTERPARTY ? null : picked ?? null
      await applyTransferLink.mutateAsync({
        sessionId,
        rowIndexA: link.rowIndexA,
        rowIndexB: link.rowIndexB,
        ...(link.rowIndexB === null ? { counterAccountId } : {}),
      })
    } finally {
      setPendingLinkRow(null)
    }
  }

  const handleDismissTransfer = async (c: TransactionCandidate) => {
    const link = c.extra?.proposedTransferLink
    if (!link) return
    setPendingLinkRow(c.rowIndex)
    try {
      await dismissTransferLink.mutateAsync({
        sessionId,
        rowIndexA: link.rowIndexA,
        rowIndexB: link.rowIndexB,
      })
    } finally {
      setPendingLinkRow(null)
    }
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("candidatePanelEmpty")}
        </CardContent>
      </Card>
    )
  }

  // Deferred rows (selected=false) still appear in filter counts so the user
  // can see them in-situ — we force `selected: true` when summarizing so they
  // get counted. They're still excluded from commit (see validateImportCommit).
  const reviewable = candidates.map((c) => ({
    rowIndex: c.rowIndex,
    selected: true,
    status: c.status,
    categoryCode: c.categoryCode,
    total: c.total,
    currencyCode: c.currencyCode,
  }))
  const { counts } = summarizeImportCandidates(reviewable)

  const countByFilter = (k: FilterKey): number => {
    if (k === "all") return candidates.length
    return counts[k] ?? 0
  }

  const filtered =
    filter === "all"
      ? candidates
      : candidates.filter((c) => effectiveReviewStatus(c) === filter)
  const afterToggles = filtered.filter((c) => {
    const isDuplicate = !!c.extra?.duplicateOfId
    const isDeferred = c.selected === false
    // Show the row if:
    //   - it's neither duplicate nor deferred (always shown), OR
    //   - at least one of its flags is in an included category.
    // This means flipping ON "Include duplicates" reveals duplicate-AND-deferred
    // rows too, since the duplicate flag is now included.
    if (!isDuplicate && !isDeferred) return true
    if (isDuplicate && includeDuplicates) return true
    if (isDeferred && includeDeferred) return true
    return false
  })
  const toggleHiddenCount = filtered.length - afterToggles.length
  const sorted = [...afterToggles].sort((a, b) => {
    const ap = SORT_PRIORITY[effectiveReviewStatus(a)] ?? 99
    const bp = SORT_PRIORITY[effectiveReviewStatus(b)] ?? 99
    if (ap !== bp) return ap - bp
    return a.rowIndex - b.rowIndex
  })
  const visible = sorted.slice(0, visibleLimit)
  const paginationHiddenCount = sorted.length - visible.length

  const onFilterChange = (next: FilterKey) => {
    setFilter(next)
    setVisibleLimit(PAGE_SIZE)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1 shrink-0">
        <h3 className="text-[13px] font-medium tracking-tight flex-shrink-0">
          {t("candidatePanelTitle")}
        </h3>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {sorted.length === candidates.length
            ? `${candidates.length} total`
            : `${sorted.length} of ${candidates.length}`}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 flex-wrap shrink-0">
        {FILTER_ORDER.map((k) => {
          const active = filter === k
          const count = countByFilter(k)
          const dotClass = k === "all" ? null : STATUS_DOT[k]
          return (
            <button
              key={k}
              type="button"
              onClick={() => onFilterChange(k)}
              className={[
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors",
                active
                  ? "bg-foreground text-background font-medium"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {dotClass ? (
                <span className={["h-1.5 w-1.5 rounded-full flex-shrink-0", dotClass].join(" ")} />
              ) : null}
              <span>{FILTER_LABEL[k]}</span>
              <span
                className={[
                  "tabular-nums",
                  active ? "text-background/70" : "text-muted-foreground/70",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground shrink-0">
        <Button
          type="button"
          size="sm"
          variant={includeDuplicates ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => {
            setIncludeDuplicates((v) => !v)
            setVisibleLimit(PAGE_SIZE)
          }}
        >
          {includeDuplicates ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <CopyX className="h-3 w-3 mr-1" />
          )}
          {t("filters.includeDuplicates")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={includeDeferred ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => {
            setIncludeDeferred((v) => !v)
            setVisibleLimit(PAGE_SIZE)
          }}
        >
          {includeDeferred ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <EyeOff className="h-3 w-3 mr-1" />
          )}
          {t("filters.includeDeferred")}
        </Button>
        {toggleHiddenCount > 0 ? (
          <span className="text-[11px]">
            {t("filters.hiddenCount", { count: toggleHiddenCount })}
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-card/40 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-[11px] text-muted-foreground">
              No transactions match this filter.
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/30">
                {visible.map((c) => {
                  const link = c.extra?.proposedTransferLink
                  const showBanner = !!link && link.rowIndexA === c.rowIndex
                  const sibling =
                    link && link.rowIndexB !== null
                      ? candidates.find((o) => o.rowIndex === link.rowIndexB) ?? null
                      : null
                  // For orphan transfers, resolve which account (if any) is
                  // currently slotted as the counter-party: the user's latest
                  // pick wins, then the AI's suggestion, else "external".
                  const isOrphan = !!link && link.rowIndexB === null
                  const orphanPicked =
                    isOrphan && link
                      ? pickedCounterAccountId[c.rowIndex] ??
                        link.counterAccountId ??
                        EXTERNAL_COUNTERPARTY
                      : EXTERNAL_COUNTERPARTY
                  const orphanAccount =
                    isOrphan && orphanPicked !== EXTERNAL_COUNTERPARTY
                      ? accountById.get(orphanPicked) ?? null
                      : null
                  const counterSummary = (() => {
                    if (!link) return ""
                    if (link.rowIndexB !== null) return formatLegSummary(sibling)
                    if (orphanAccount) {
                      return orphanAccount.bankName &&
                        orphanAccount.bankName.toLowerCase() !==
                          orphanAccount.name.toLowerCase()
                        ? `${orphanAccount.name} · ${orphanAccount.bankName}`
                        : orphanAccount.name
                    }
                    return t("transfers.unknownCounterparty")
                  })()
                  return (
                    <div key={c.rowIndex}>
                      {showBanner && link ? (
                        <div className="mx-3 my-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                          <div className="flex items-center gap-2 font-medium text-amber-900">
                            <ArrowLeftRight className="h-4 w-4" />
                            <span>{t("transfers.proposedBanner")}</span>
                          </div>
                          <div className="mt-1 text-xs text-amber-900/80">
                            {formatLegSummary(c)}
                            {" ↔ "}
                            {counterSummary}
                          </div>
                          <div className="mt-1 text-xs text-amber-900/70 italic">{link.reason}</div>
                          {isOrphan ? (
                            <div className="mt-2">
                              <label className="text-xs text-amber-900/80">
                                {t("transfers.pickCounterAccount")}
                              </label>
                              <Select
                                value={orphanPicked}
                                onValueChange={(v) =>
                                  setPickedCounterAccountId((m) => ({
                                    ...m,
                                    [c.rowIndex]: v,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs mt-1">
                                  <SelectValue
                                    placeholder={t(
                                      "transfers.pickCounterAccountPlaceholder",
                                    )}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={EXTERNAL_COUNTERPARTY}>
                                    {t("transfers.externalCounterparty")}
                                  </SelectItem>
                                  {accounts
                                    .filter((a) => a.id !== c.accountId)
                                    .map((a) => (
                                      <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                        {a.bankName ? ` · ${a.bankName}` : ""}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleConfirmTransfer(c)}
                              disabled={pendingLinkRow === c.rowIndex}
                            >
                              {t("transfers.confirm")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDismissTransfer(c)}
                              disabled={pendingLinkRow === c.rowIndex}
                            >
                              {t("transfers.dismiss")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <CandidateRow
                        c={c}
                        accountById={accountById}
                        categories={categories}
                        projects={projects}
                        analysis={analysisByRow[String(c.rowIndex)] ?? null}
                        onToggleSelected={handleToggleSelected}
                        onUpdate={(patch) =>
                          updateCandidate.mutate({
                            sessionId,
                            rowIndex: c.rowIndex,
                            ...patch,
                          })
                        }
                        locale={locale}
                      />
                    </div>
                  )
                })}
              </div>
              {paginationHiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}
                  className="w-full py-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/40"
                >
                  Show {Math.min(PAGE_SIZE, paginationHiddenCount)} more
                  <span className="text-muted-foreground/60"> · {paginationHiddenCount} hidden</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type CandidatePatch = {
  type?: string | null
  categoryCode?: string | null
  projectCode?: string | null
  status?:
    | "needs_review"
    | "business"
    | "business_non_deductible"
    | "personal_taxable"
    | "personal_ignored"
    | "internal"
}

const TRANSACTION_TYPES: string[] = [
  "income",
  "expense",
  "refund",
  "transfer",
  "exchange",
  "other",
]

const EDITABLE_STATUSES: Array<CandidatePatch["status"] & string> = [
  "needs_review",
  "business",
  "business_non_deductible",
  "personal_taxable",
  "personal_ignored",
  "internal",
]

const NONE_SENTINEL = "__none__"

function CandidateRow({
  c,
  accountById,
  categories,
  projects,
  analysis,
  onToggleSelected,
  onUpdate,
  locale,
}: {
  c: TransactionCandidate
  accountById: Map<string, AccountInfo>
  categories: Array<{ code: string; name: unknown }>
  projects: Array<{ code: string; name: unknown }>
  analysis: AnalysisEntry | null
  onToggleSelected: (c: TransactionCandidate, next: boolean) => void
  onUpdate: (patch: CandidatePatch) => void
  locale: string
}) {
  const { t } = useTranslation("wizard")
  const [expanded, setExpanded] = useState(false)

  const dotClass = STATUS_DOT[c.status] ?? "bg-muted-foreground/30"
  const statusLabel = STATUS_LABEL[c.status] ?? c.status

  // Title prefers `name` (per-row descriptor like "Sell ETH") over `merchant`
  // (often a constant like "SwissBorg"). If both exist and differ, merchant
  // shows as a secondary line below the title.
  const title = c.name || c.merchant || `Row ${c.rowIndex}`
  const nameLineDistinct =
    c.name && c.merchant && c.name.trim().toLowerCase() !== c.merchant.trim().toLowerCase()
      ? c.merchant
      : null
  const description = c.description?.trim() || null
  const crypto = c.extra?.crypto
  const counterAccount =
    c.counterAccountId ? accountById.get(c.counterAccountId) ?? null : null
  const reasoning = analysis?.reasoning?.trim() || null
  // Always expandable now — the inline editors (type/category/status) live in
  // the expanded view and need to be reachable for every row, even rows with
  // no AI reasoning or raw name discrepancies.
  const hasDetail = true

  // Match the server's `validateImportCommit` rules so the row can flag
  // _itself_ as a commit blocker without us plumbing a separate list down.
  // Only selected rows block the commit button, so deferred rows don't need
  // the warning.
  const blocker: "needs_review" | "missing_category" | null =
    c.selected &&
    (c.status === "needs_review" || c.status === null || c.status === undefined)
      ? "needs_review"
      : c.selected &&
          (c.status === "business" || c.status === "business_non_deductible") &&
          !c.categoryCode
        ? "missing_category"
        : null

  const account = c.accountId ? accountById.get(c.accountId) : null
  const accountLabel = account
    ? account.bankName && account.bankName.toLowerCase() !== account.name.toLowerCase()
      ? `${account.name} · ${account.bankName}`
      : account.name
    : null
  const accountShort = accountLabel?.split(" · ")[0] ?? accountLabel

  const prefix = candidateSignPrefix(c)
  const absTotal = c.total !== null ? Math.abs(c.total) : null
  const amount =
    absTotal !== null && c.currencyCode
      ? formatCurrency(absTotal, c.currencyCode)
      : absTotal !== null
        ? (absTotal / 100).toFixed(2)
        : ""
  const amountClass =
    prefix === "+"
      ? "text-emerald-600 dark:text-emerald-400"
      : prefix === "−"
        ? "text-rose-600 dark:text-rose-400"
        : ""

  const lowConfidence = (c.confidence?.overall ?? 1) < 0.6

  const toggleAriaLabel = c.selected ? t("transfers.deferRow") : t("transfers.includeRow")

  return (
    <div
      className={[
        "px-4 py-2.5 transition-colors border-l-2",
        hasDetail ? "cursor-pointer" : "",
        expanded ? "bg-muted/30" : "hover:bg-muted/15",
        blocker
          ? "border-l-rose-500 bg-rose-50/30 dark:bg-rose-950/10"
          : "border-l-transparent",
      ].join(" ")}
      onClick={() => hasDetail && setExpanded((v) => !v)}
      role={hasDetail ? "button" : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={c.selected}
            onCheckedChange={(value) => onToggleSelected(c, value === true)}
            aria-label={toggleAriaLabel}
            title={toggleAriaLabel}
            className="shrink-0"
          />
        </div>
        <div className={cn("flex min-w-0 flex-1 items-center gap-3", !c.selected && "opacity-50")}>
          <span
            className={["h-2 w-2 rounded-full flex-shrink-0", dotClass].join(" ")}
            title={statusLabel}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <span
                className="flex-shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground/70"
                title={t("rowDetail.rowIndex", { defaultValue: "Row" })}
              >
                #{c.rowIndex}
              </span>
              <div className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight">
                {title}
              </div>
              <div
                className={cn(
                  "text-[13px] tabular-nums font-medium flex-shrink-0 tracking-tight",
                  amountClass,
                )}
              >
                {prefix}
                {amount}
              </div>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
              {c.issuedAt ? (
                <>
                  <span className="tabular-nums flex-shrink-0">{c.issuedAt}</span>
                  <span className="text-muted-foreground/50">·</span>
                </>
              ) : null}
              <span className="flex-shrink-0">{statusLabel}</span>
              {blocker ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200 flex-shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/40"
                  title={
                    blocker === "needs_review"
                      ? "This row still needs a final status before you can commit."
                      : "Business rows must have a category before you can commit."
                  }
                >
                  <AlertTriangle className="h-3 w-3" />
                  {blocker === "needs_review" ? "needs review" : "needs category"}
                </span>
              ) : null}
              {c.extra?.duplicateOfId ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200 flex-shrink-0">
                  <CopyX className="h-3 w-3" />
                  {t("transfers.duplicateBadge")}
                </span>
              ) : null}
              {!c.selected ? (
                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground flex-shrink-0">
                  {t("transfers.deferredBadge")}
                </span>
              ) : null}
              {accountShort ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span
                    className="flex items-center gap-1 min-w-0 truncate"
                    title={accountLabel ?? undefined}
                  >
                    <Landmark className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="truncate">{accountShort}</span>
                  </span>
                </>
              ) : null}
              {c.ruleMatched ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-blue-600 dark:text-blue-400 flex-shrink-0">rule</span>
                </>
              ) : null}
              {lowConfidence ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">
                    low confidence
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {expanded && hasDetail ? (
        <div
          className={cn(
            "mt-2 ml-5 space-y-1.5 text-[12px] text-muted-foreground border-l border-border/60 pl-3",
            !c.selected && "opacity-50",
          )}
        >
          {nameLineDistinct ? (
            <div>
              <span className="text-muted-foreground/60">{t("rowDetail.rawName", { defaultValue: "Raw name" })}: </span>
              <span className="text-foreground/80">{nameLineDistinct}</span>
            </div>
          ) : null}
          {description ? (
            <div className="whitespace-pre-wrap break-words text-foreground/80">
              {description}
            </div>
          ) : null}
          <div
            className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <CandidateEditField label={t("rowDetail.status", { defaultValue: "Status" })}>
              <Select
                value={c.status ?? "needs_review"}
                onValueChange={(v) =>
                  onUpdate({ status: v as NonNullable<CandidatePatch["status"]> })
                }
              >
                <SelectTrigger
                  className={cn(
                    "h-7 text-[11px]",
                    blocker === "needs_review" && "ring-2 ring-rose-400 border-rose-400",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABEL[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CandidateEditField>
            <CandidateEditField label={t("rowDetail.type", { defaultValue: "Type" })}>
              <Select
                value={c.type ?? NONE_SENTINEL}
                onValueChange={(v) =>
                  onUpdate({ type: v === NONE_SENTINEL ? null : v })
                }
              >
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL} className="text-xs text-muted-foreground">—</SelectItem>
                  {TRANSACTION_TYPES.map((typ) => (
                    <SelectItem key={typ} value={typ} className="text-xs">
                      {typ}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CandidateEditField>
            <CandidateEditField label={t("rowDetail.category", { defaultValue: "Category" })}>
              <Select
                value={c.categoryCode ?? NONE_SENTINEL}
                onValueChange={(v) =>
                  onUpdate({ categoryCode: v === NONE_SENTINEL ? null : v })
                }
              >
                <SelectTrigger
                  className={cn(
                    "h-7 text-[11px]",
                    blocker === "missing_category" && "ring-2 ring-rose-400 border-rose-400",
                  )}
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL} className="text-xs text-muted-foreground">—</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code} className="text-xs">
                      {getLocalizedValue(cat.name, locale) || cat.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CandidateEditField>
            <CandidateEditField label={t("rowDetail.project", { defaultValue: "Project" })}>
              <Select
                value={c.projectCode ?? NONE_SENTINEL}
                onValueChange={(v) =>
                  onUpdate({ projectCode: v === NONE_SENTINEL ? null : v })
                }
              >
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL} className="text-xs text-muted-foreground">—</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.code} value={p.code} className="text-xs">
                      {getLocalizedValue(p.name, locale) || p.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CandidateEditField>
          </div>
          {(c.transferDirection || counterAccount || c.transferId) ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
              {c.transferDirection ? (
                <span>
                  <span className="text-muted-foreground/60">{t("rowDetail.transfer", { defaultValue: "Transfer" })}: </span>
                  <span className="text-foreground/80">{c.transferDirection}</span>
                </span>
              ) : null}
              {counterAccount ? (
                <span>
                  <span className="text-muted-foreground/60">{t("rowDetail.counterAccount", { defaultValue: "Counter account" })}: </span>
                  <span className="text-foreground/80">
                    {counterAccount.name}
                    {counterAccount.bankName ? ` · ${counterAccount.bankName}` : ""}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
          {crypto ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
              <span>
                <span className="text-muted-foreground/60">{t("rowDetail.crypto", { defaultValue: "Crypto" })}: </span>
                <span className="text-foreground/80">
                  {crypto.asset ?? "—"}
                  {crypto.quantity ? ` · qty ${crypto.quantity}` : ""}
                  {typeof crypto.pricePerUnit === "number" ? ` · px ${crypto.pricePerUnit}` : ""}
                </span>
              </span>
            </div>
          ) : null}
          {reasoning ? (
            <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted-foreground/70 mb-1">
                <Sparkles className="h-3 w-3" />
                <span>
                  {t("rowDetail.aiReasoning", { defaultValue: "AI reasoning" })}
                  {analysis?.model ? ` · ${analysis.model}` : analysis?.provider ? ` · ${analysis.provider}` : ""}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground/80">
                {reasoning}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CandidateEditField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
      <span>{label}</span>
      <span className="normal-case tracking-normal">{children}</span>
    </label>
  )
}
