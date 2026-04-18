import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Coins,
  Loader2,
  Link2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  RotateCw,
  Info,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"

function fmtCents(cents: number | null | undefined, currencyCode = "EUR"): string {
  if (cents === null || cents === undefined) return "—"
  return formatCurrency(cents, currencyCode)
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleDateString()
}

function fmtQty(q: string | null | undefined): string {
  if (!q) return "—"
  const n = Number(q)
  if (!Number.isFinite(n)) return q
  // Trim trailing zeros but keep up to 8 decimals
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function CryptoPage() {
  const { t } = useTranslation("crypto")
  const utils = trpc.useUtils()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [userPickedYear, setUserPickedYear] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  // Years that actually contain crypto-tagged transactions — used to rescue
  // the year picker from defaulting to an empty current year when all data
  // was imported for a previous tax year.
  const { data: availableYears = [] } = trpc.crypto.availableYears.useQuery({})

  // One-shot auto-correct: if the user hasn't manually picked a year yet and
  // the current default is empty, jump to the latest year with real data.
  useEffect(() => {
    if (userPickedYear) return
    if (availableYears.length === 0) return
    if (availableYears.includes(year)) return
    const latestWithData = availableYears[0]
    if (typeof latestWithData === "number") setYear(latestWithData)
  }, [availableYears, year, userPickedYear])

  const { data: summary, isLoading: summaryLoading } = trpc.crypto.summary.useQuery({ year })
  const { data: disposals = [], isLoading: listLoading } = trpc.crypto.listDisposals.useQuery({ year })
  const { data: holdings = [], isLoading: holdingsLoading } = trpc.crypto.holdings.useQuery({})
  const { data: suggestions = [] } = trpc.crypto.suggestGatewayLinks.useQuery(undefined, {
    enabled: suggestionsOpen,
  })

  const replayFifo = trpc.crypto.replayFifo.useMutation({
    onSuccess: () => {
      utils.crypto.summary.invalidate()
      utils.crypto.listDisposals.invalidate()
      utils.crypto.holdings.invalidate()
    },
  })

  const linkGateway = trpc.crypto.linkGateway.useMutation({
    onSuccess: () => {
      utils.crypto.summary.invalidate()
      utils.crypto.listDisposals.invalidate()
      utils.crypto.holdings.invalidate()
      utils.crypto.suggestGatewayLinks.invalidate()
    },
  })

  // Merge a rolling 4-year window with whatever years the user actually has
  // data for, then sort descending. Keeps the current year visible (even if
  // empty) while always exposing years with real data.
  const yearOptions = (() => {
    const now = new Date().getFullYear()
    const set = new Set<number>([now, now - 1, now - 2, now - 3, ...availableYears])
    return [...set].sort((a, b) => b - a).slice(0, 6)
  })()

  const gain = summary?.realizedGainCents ?? 0
  const isGain = gain >= 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" />
            {t("title")}
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>
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
                title={hasData ? undefined : t("yearNoDataHint")}
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
      </header>

      {/* Summary */}
      <section>
        {summaryLoading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryCard label={t("proceedsLabel")} value={fmtCents(summary?.totalProceedsCents ?? 0)} />
            <SummaryCard label={t("costBasisLabel")} value={fmtCents(summary?.totalCostBasisCents ?? 0)} />
            <SummaryCard
              label={t("realizedGainLabel")}
              value={fmtCents(gain)}
              tone={isGain ? "positive" : "negative"}
              icon={isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            />
          </div>
        )}

        {summary && summary.byAsset.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {summary.byAsset.map((a) => (
              <span
                key={a.asset}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 text-[11px] tabular-nums"
              >
                <span className="font-medium">{a.asset}</span>
                <span className="text-muted-foreground">· {fmtQty(a.quantity)}</span>
                <span
                  className={[
                    "text-muted-foreground",
                    a.realizedGainCents > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
                    a.realizedGainCents < 0 ? "text-rose-600 dark:text-rose-400" : "",
                  ].join(" ")}
                >
                  · {fmtCents(a.realizedGainCents)}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        {summary ? <DiagnosticStrip summary={summary} availableYears={availableYears} year={year} onJumpYear={(y) => { setUserPickedYear(true); setYear(y) }} onReplay={() => replayFifo.mutate({})} replayPending={replayFifo.isPending} /> : null}

        {summary && summary.untrackedDisposalsCount > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {t("untrackedWarning", { count: summary.untrackedDisposalsCount })}
          </div>
        ) : null}
      </section>

      {/* Holdings — open FIFO lots grouped by asset */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-medium tracking-tight">{t("holdingsHeading")}</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {holdings.length} {t("assets")}
          </span>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
          {holdingsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline" />
            </div>
          ) : holdings.length === 0 ? (
            <div className="py-10 text-center text-[11px] text-muted-foreground">
              {t("holdingsEmpty")}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {holdings.map((h) => (
                <div key={h.asset} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full flex-shrink-0 bg-sky-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <div className="text-[13px] font-medium tracking-tight">{h.asset}</div>
                      <div className="text-[13px] tabular-nums font-medium tracking-tight flex-shrink-0 ml-auto">
                        {fmtQty(h.totalQuantity)}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{t("avgCost")}:</span>
                      <span className="tabular-nums">
                        {h.weightedAvgCostCents === null
                          ? "—"
                          : fmtCents(h.weightedAvgCostCents)}
                      </span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{t("openLotsLabel", { count: h.openLots })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Disposals */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-medium tracking-tight">{t("disposalsHeading")}</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {disposals.length} {t("rows")}
          </span>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
          {listLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline" />
            </div>
          ) : disposals.length === 0 ? (
            <div className="py-12 text-center text-[11px] text-muted-foreground">
              {t("disposalsEmpty")}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {disposals.map((d) => (
                <DisposalRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Gateway suggestions */}
      <section>
        <button
          type="button"
          onClick={() => setSuggestionsOpen((v) => !v)}
          className="w-full flex items-center gap-2 text-[13px] font-medium tracking-tight px-1 hover:text-foreground"
        >
          {suggestionsOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {t("gatewaySuggestionsHeading")}
          {suggestions.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {suggestions.length}
            </Badge>
          ) : null}
        </button>

        {suggestionsOpen ? (
          <div className="mt-2 space-y-2">
            {suggestions.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-[11px] text-muted-foreground">
                  {t("noSuggestions")}
                </CardContent>
              </Card>
            ) : (
              suggestions.map((s) => (
                <Card key={s.disposalTransactionId + s.bankTransactionId}>
                  <CardContent className="py-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 text-[12px]">
                      <div className="font-medium">
                        {s.disposalAsset ?? "?"} · {fmtQty(s.disposalQuantity)} ·{" "}
                        {fmtCents(s.disposalProceedsCents)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(s.disposalIssuedAt)} → {fmtDate(s.bankIssuedAt)}
                        {s.bankAccountName ? ` · ${s.bankAccountName}` : ""}
                        {" · "}
                        {fmtCents(s.bankTotalCents)}
                        {" · "}
                        {t("daysApart", { count: s.daysApart })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        linkGateway.mutate({
                          disposalTransactionId: s.disposalTransactionId,
                          gatewayTransactionId: s.bankTransactionId,
                        })
                      }
                      disabled={linkGateway.isPending}
                      className="rounded-full"
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1.5" />
                      {t("linkGateway")}
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </section>

      <footer className="pt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {t("accountTypeHint")}{" "}
          <Link to={"/settings/accounts" as string} className="underline">
            {t("settingsAccountsLinkLabel")}
          </Link>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {replayFifo.data ? (
            <span className="tabular-nums">
              {t("replayResult", {
                lots: replayFifo.data.lotsCreated,
                disposals: replayFifo.data.disposalsMatched,
              })}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => replayFifo.mutate({})}
            disabled={replayFifo.isPending}
            className="h-7 text-[11px]"
          >
            {replayFifo.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("replayFifo")}
          </Button>
        </div>
      </footer>
    </div>
  )
}

type SummaryShape = {
  year: number
  totalProceedsCents: number
  totalCostBasisCents: number
  realizedGainCents: number
  disposalRowCount: number
  disposalRowsWithFifoMatch: number
  disposalRowsMissingPrice: number
  untrackedDisposalsCount: number
}

function DiagnosticStrip({
  summary,
  availableYears,
  year,
  onJumpYear,
  onReplay,
  replayPending,
}: {
  summary: SummaryShape
  availableYears: number[]
  year: number
  onJumpYear: (y: number) => void
  onReplay: () => void
  replayPending: boolean
}) {
  const { t } = useTranslation("crypto")
  const totalsAreZero =
    summary.totalProceedsCents === 0 &&
    summary.totalCostBasisCents === 0 &&
    summary.realizedGainCents === 0

  // Case 1: no disposals at all in the selected year.
  if (summary.disposalRowCount === 0) {
    const suggestion = availableYears.find((y) => y !== year)
    return (
      <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground flex flex-wrap items-center gap-2">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{t("diagNoDisposals", { year })}</span>
        {suggestion !== undefined ? (
          <button
            type="button"
            onClick={() => onJumpYear(suggestion)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t("diagJumpYear", { year: suggestion })}
          </button>
        ) : (
          <span>{t("diagNoDataAnywhere")}</span>
        )}
      </div>
    )
  }

  // Case 2: we have disposal rows but totals are zero — usually because the
  // FIFO ledger is empty (no replay yet) AND no fallback pricePerUnit exists.
  if (totalsAreZero && summary.disposalRowsWithFifoMatch === 0) {
    return (
      <div className="mt-3 rounded-lg border border-sky-300/60 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-[12px] text-sky-900 dark:text-sky-200 flex flex-wrap items-center gap-2">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1">
          {t("diagFifoEmpty", { count: summary.disposalRowCount })}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onReplay}
          disabled={replayPending}
          className="h-7 text-[11px]"
        >
          {replayPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t("replayFifo")}
        </Button>
      </div>
    )
  }

  // Case 3: some disposals can't be summed because they lack both FIFO
  // matches AND a fallback pricePerUnit.
  if (summary.disposalRowsMissingPrice > 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{t("diagMissingPrice", { count: summary.disposalRowsMissingPrice })}</span>
      </div>
    )
  }

  return null
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone?: "positive" | "negative"
  icon?: React.ReactNode
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : ""
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={[
          "mt-0.5 text-[17px] font-semibold tabular-nums flex items-center gap-1.5 tracking-tight",
          toneClass,
        ].join(" ")}
      >
        {icon}
        {value}
      </div>
    </div>
  )
}

type DisposalRow = {
  id: string
  issuedAt: Date | null
  name: string | null
  merchant: string | null
  total: number | null
  currencyCode: string | null
  categoryCode: string | null
  accountId: string | null
  status: string | null
  crypto: {
    asset?: string | undefined
    quantity?: string | undefined
    pricePerUnit?: number | null | undefined
    costBasisPerUnit?: number | null | undefined
    realizedGainCents?: number | null | undefined
    gatewayTransactionId?: string | null | undefined
  }
  gatewayLinked: boolean
}

function DisposalRow({ d }: { d: DisposalRow }) {
  const gain = d.crypto.realizedGainCents
  const hasCost = d.crypto.costBasisPerUnit !== null && d.crypto.costBasisPerUnit !== undefined
  const currency = d.currencyCode ?? "EUR"

  return (
    <Link
      to={`/transactions/${d.id}` as string}
      className="block px-4 py-2.5 hover:bg-muted/15 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "h-2 w-2 rounded-full flex-shrink-0",
            hasCost ? "bg-emerald-500" : "bg-amber-500",
          ].join(" ")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <div className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight">
              {d.crypto.asset ?? "?"} · {fmtQty(d.crypto.quantity)}
            </div>
            <div
              className={[
                "text-[13px] tabular-nums font-medium tracking-tight flex-shrink-0",
                typeof gain === "number" && gain > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
                typeof gain === "number" && gain < 0 ? "text-rose-600 dark:text-rose-400" : "",
              ].join(" ")}
            >
              {gain === null || gain === undefined ? "—" : fmtCents(gain, currency)}
            </div>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
            <span className="tabular-nums flex-shrink-0">{fmtDate(d.issuedAt)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="truncate">
              {d.merchant || d.name || "—"}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums flex-shrink-0">
              {fmtCents(d.crypto.pricePerUnit ?? null, currency)} / {d.crypto.asset ?? "?"}
            </span>
            {!hasCost ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">
                  {/* tint is enough; i18n key handled in empty-basis warning */}
                  no basis
                </span>
              </>
            ) : null}
            {d.gatewayLinked ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Link2 className="h-2.5 w-2.5 flex-shrink-0" />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}
