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
import { ArrowLeftRight, Check, CopyX, EyeOff, Landmark } from "lucide-react"
import type { TransactionCandidate } from "@/ai/import-csv"
import { cn, formatCurrency } from "@/lib/utils"
import { summarizeImportCandidates } from "@/lib/import-review"
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

function formatLegSummary(c?: TransactionCandidate | null): string {
  if (!c) return "—"
  const parts: string[] = []
  if (c.merchant) parts.push(c.merchant)
  if (c.total !== null && c.currencyCode) {
    parts.push(formatCurrency(c.total, c.currencyCode))
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

const PAGE_SIZE = 50

export function WizardCandidatePanel({ sessionId, candidates }: Props) {
  const { t } = useTranslation("wizard")
  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
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

  const filtered = filter === "all" ? candidates : candidates.filter((c) => c.status === filter)
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
    const ap = SORT_PRIORITY[a.status] ?? 99
    const bp = SORT_PRIORITY[b.status] ?? 99
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
                        onToggleSelected={handleToggleSelected}
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

function CandidateRow({
  c,
  accountById,
  onToggleSelected,
}: {
  c: TransactionCandidate
  accountById: Map<string, AccountInfo>
  onToggleSelected: (c: TransactionCandidate, next: boolean) => void
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
  const hasDetail = Boolean(description || nameLineDistinct)

  const account = c.accountId ? accountById.get(c.accountId) : null
  const accountLabel = account
    ? account.bankName && account.bankName.toLowerCase() !== account.name.toLowerCase()
      ? `${account.name} · ${account.bankName}`
      : account.name
    : null
  const accountShort = accountLabel?.split(" · ")[0] ?? accountLabel

  const amount =
    c.total !== null && c.currencyCode
      ? formatCurrency(c.total, c.currencyCode)
      : c.total !== null
        ? (c.total / 100).toFixed(2)
        : ""

  const lowConfidence = (c.confidence?.overall ?? 1) < 0.6

  const toggleAriaLabel = c.selected ? t("transfers.deferRow") : t("transfers.includeRow")

  return (
    <div
      className={[
        "px-4 py-2.5 transition-colors",
        hasDetail ? "cursor-pointer" : "",
        expanded ? "bg-muted/30" : "hover:bg-muted/15",
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
              <div className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight">
                {title}
              </div>
              <div className="text-[13px] tabular-nums font-medium flex-shrink-0 tracking-tight">
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
            "mt-2 ml-5 space-y-1 text-[12px] text-muted-foreground border-l border-border/60 pl-3",
            !c.selected && "opacity-50",
          )}
        >
          {nameLineDistinct ? (
            <div>
              <span className="text-muted-foreground/60">Raw name: </span>
              {nameLineDistinct}
            </div>
          ) : null}
          {description ? (
            <div className="whitespace-pre-wrap break-words">{description}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
