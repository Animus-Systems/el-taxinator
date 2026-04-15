import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Landmark } from "lucide-react"
import type { TransactionCandidate } from "@/ai/import-csv"
import { formatCurrency } from "@/lib/utils"
import { summarizeImportCandidates } from "@/lib/import-review"
import { trpc } from "~/trpc"

type Props = {
  candidates: TransactionCandidate[]
}

type StatusKey = "needs_review" | "business" | "business_non_deductible" | "personal_ignored"
type FilterKey = "all" | StatusKey

const STATUS_DOT: Record<string, string> = {
  business: "bg-emerald-500",
  business_non_deductible: "bg-amber-500",
  personal_ignored: "bg-muted-foreground/30",
  needs_review: "bg-rose-500",
}

const STATUS_LABEL: Record<string, string> = {
  business: "Business",
  business_non_deductible: "Non-deductible",
  personal_ignored: "Personal",
  needs_review: "Needs review",
}

const FILTER_ORDER: FilterKey[] = [
  "all",
  "needs_review",
  "business",
  "business_non_deductible",
  "personal_ignored",
]

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  needs_review: "Needs review",
  business: "Business",
  business_non_deductible: "Non-deductible",
  personal_ignored: "Personal",
}

// Sort priority: needs_review at top, everything else preserves original order.
const SORT_PRIORITY: Record<string, number> = {
  needs_review: 0,
  business_non_deductible: 1,
  business: 2,
  personal_ignored: 3,
}

type AccountInfo = { name: string; bankName: string | null }

const PAGE_SIZE = 50

export function WizardCandidatePanel({ candidates }: Props) {
  const { t } = useTranslation("wizard")
  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
  const accountById = new Map<string, AccountInfo>(
    accounts.map((a) => [a.id, { name: a.name, bankName: a.bankName ?? null }]),
  )

  const [filter, setFilter] = useState<FilterKey>("all")
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("candidatePanelEmpty")}
        </CardContent>
      </Card>
    )
  }

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
  const sorted = [...filtered].sort((a, b) => {
    const ap = SORT_PRIORITY[a.status] ?? 99
    const bp = SORT_PRIORITY[b.status] ?? 99
    if (ap !== bp) return ap - bp
    return a.rowIndex - b.rowIndex
  })
  const visible = sorted.slice(0, visibleLimit)
  const hiddenCount = sorted.length - visible.length

  const onFilterChange = (next: FilterKey) => {
    setFilter(next)
    setVisibleLimit(PAGE_SIZE)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-[13px] font-medium tracking-tight flex-shrink-0">
          {t("candidatePanelTitle")}
        </h3>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {sorted.length === candidates.length
            ? `${candidates.length} total`
            : `${sorted.length} of ${candidates.length}`}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 flex-wrap">
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

      <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
        <div className="max-h-[78vh] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-[11px] text-muted-foreground">
              No transactions match this filter.
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/30">
                {visible.map((c) => (
                  <CandidateRow key={c.rowIndex} c={c} accountById={accountById} />
                ))}
              </div>
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}
                  className="w-full py-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/40"
                >
                  Show {Math.min(PAGE_SIZE, hiddenCount)} more
                  <span className="text-muted-foreground/60"> · {hiddenCount} hidden</span>
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
}: {
  c: TransactionCandidate
  accountById: Map<string, AccountInfo>
}) {
  const [expanded, setExpanded] = useState(false)

  const dotClass = STATUS_DOT[c.status] ?? "bg-muted-foreground/30"
  const statusLabel = STATUS_LABEL[c.status] ?? c.status

  const title = c.merchant || c.name || `Row ${c.rowIndex}`
  const nameLineDistinct =
    c.name && c.merchant && c.name.trim().toLowerCase() !== c.merchant.trim().toLowerCase()
      ? c.name
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
      <div className="flex items-center gap-3">
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

      {expanded && hasDetail ? (
        <div className="mt-2 ml-5 space-y-1 text-[12px] text-muted-foreground border-l border-border/60 pl-3">
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
