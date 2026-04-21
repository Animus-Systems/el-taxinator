import { useParams, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AlertTriangle, Download, PartyPopper, FileText, PlusCircle, Lightbulb, RotateCcw, Sparkles, Loader2, History, UserRound } from "lucide-react"
import type { SessionReport } from "@/ai/session-report"

export function WizardCommittedPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string }
  const { t } = useTranslation("wizard")

  const { data, isLoading, isFetching, error } = trpc.wizard.getReportPreview.useQuery(
    { sessionId },
    { enabled: !!sessionId },
  )

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 text-sm text-destructive">
        {error?.message ?? "Session not found"}
      </div>
    )
  }

  const report = data as SessionReport
  const ccy = report.totals.currencyCode ?? "EUR"

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary" />
            {t("commitSuccess")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {report.session.title || report.session.fileName || report.session.id}
            {report.session.bankName ? ` · ${report.session.bankName}` : ""}
            {" · "}
            {report.totals.byStatus["business"]?.count ?? 0} deductible ·{" "}
            {report.totals.byStatus["business_non_deductible"]?.count ?? 0} non-deductible ·{" "}
            {report.totals.byStatus["personal_taxable"]?.count ?? 0} personal taxable ·{" "}
            {report.totals.byStatus["personal_ignored"]?.count ?? 0} personal ignored ·{" "}
            {report.totals.byStatus["internal"]?.count ?? 0} internal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <a href={`/api/wizard/session/${sessionId}/report.pdf`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-1" />
              {t("reportDownload")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link to={"/wizard/new" as string}>
              <PlusCircle className="h-4 w-4 mr-1" />
              {t("startNewSession")}
            </Link>
          </Button>
          {(report.totals.byStatus["personal_taxable"]?.count ?? 0) > 0 ? (
            <Button asChild variant="outline">
              <Link to={"/personal" as string}>
                <UserRound className="h-4 w-4 mr-1" />
                {t("committed.viewInPersonal")}
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to={"/transactions" as string}>
              <FileText className="h-4 w-4 mr-1" />
              Transactions
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to={"/reports" as string}>
              <History className="h-4 w-4 mr-1" />
              {t("viewAllReports")}
            </Link>
          </Button>
        </div>
      </header>

      <CommitDiagnostics report={report} />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          label={t("reportTotalsHeading") + " — deductible"}
          value={formatMoney(report.totals.deductibleTotal, ccy)}
          tone="emerald"
          isZero={report.totals.deductibleTotal === 0}
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — non-deductible"}
          value={formatMoney(report.totals.nonDeductibleTotal, ccy)}
          tone="amber"
          isZero={report.totals.nonDeductibleTotal === 0}
        />
        <SummaryCard
          label={t("committed.personalTaxable")}
          value={formatMoney(report.totals.personalTaxableTotal, ccy)}
          tone="personalTaxable"
          isZero={report.totals.personalTaxableTotal === 0}
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — " + t("committed.personalIgnored")}
          value={formatMoney(report.totals.personalTotal, ccy)}
          tone="muted"
          isZero={report.totals.personalTotal === 0}
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — grand"}
          value={formatMoney(report.totals.grandTotal, ccy)}
          tone="primary"
          isZero={report.totals.grandTotal === 0}
        />
      </section>

      {report.totals.deductibleTotal === 0 &&
        report.totals.nonDeductibleTotal === 0 &&
        (report.totals.personalTaxableTotal > 0 || report.totals.personalTotal > 0) && (
          <p className="-mt-3 text-xs text-muted-foreground italic">
            {t("committed.noBusinessActivityHint")}
          </p>
        )}

      {/* Tax-meaningful rollups */}
      {(report.taxRollups.disposalCount > 0 ||
        report.taxRollups.basisPurchases > 0 ||
        report.taxRollups.stakingRewards > 0 ||
        report.taxRollups.airdrops > 0) ? (
        <section>
          <h2 className="text-sm font-medium mb-2">{t("committed.taxRollups.title")}</h2>
          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                <RollupRow
                  label={t("committed.taxRollups.disposalProceeds")}
                  amount={formatMoney(report.taxRollups.disposalProceeds, ccy)}
                  count={report.taxRollups.disposalCount}
                  pending={report.taxRollups.pendingBasisCount}
                  pendingLabel={
                    report.taxRollups.pendingBasisCount > 0
                      ? t("committed.taxRollups.pendingBasis", {
                          count: report.taxRollups.pendingBasisCount,
                        })
                      : null
                  }
                />
                {report.taxRollups.basisPurchases > 0 ? (
                  <RollupRow
                    label={t("committed.taxRollups.basisPurchases")}
                    amount={formatMoney(report.taxRollups.basisPurchases, ccy)}
                    count={null}
                  />
                ) : null}
                {report.taxRollups.stakingRewards > 0 ? (
                  <RollupRow
                    label={t("committed.taxRollups.stakingRewards")}
                    amount={formatMoney(report.taxRollups.stakingRewards, ccy)}
                    count={null}
                  />
                ) : null}
                {report.taxRollups.airdrops > 0 ? (
                  <RollupRow
                    label={t("committed.taxRollups.airdrops")}
                    amount={formatMoney(report.taxRollups.airdrops, ccy)}
                    count={null}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* By status breakdown */}
      <section>
        <h2 className="text-sm font-medium mb-2">By status</h2>
        <Card>
          <CardContent className="py-2">
            <div className="divide-y">
              <StatusRow
                label="Business (deductible)"
                value={report.totals.byStatus["business"]}
                ccy={ccy}
              />
              <StatusRow
                label="Business (non-deductible)"
                value={report.totals.byStatus["business_non_deductible"]}
                ccy={ccy}
              />
              <StatusRow
                label={t("committed.personalTaxable")}
                value={report.totals.byStatus["personal_taxable"]}
                ccy={ccy}
              />
              <StatusRow
                label={t("committed.personalIgnored")}
                value={report.totals.byStatus["personal_ignored"]}
                ccy={ccy}
              />
              <StatusRow
                label={t("committed.internal")}
                value={report.totals.byStatus["internal"]}
                ccy={ccy}
              />
              <StatusRow
                label="Needs review"
                value={report.totals.byStatus["needs_review"]}
                ccy={ccy}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Tax tips collected */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-medium">{t("reportTaxTipsHeading")}</h2>
          <Badge variant="secondary">{report.taxTipsCollected.length}</Badge>
        </div>
        {report.taxTipsCollected.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              No tax tips were captured during this session.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {report.taxTipsCollected.map((tip, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{tip.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">{tip.body}</div>
                      <div className="text-xs text-muted-foreground mt-1 italic">
                        {t("taxTipLegalBasis")}: {tip.legalBasis}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Facts learned */}
      <section>
        <h2 className="text-sm font-medium mb-2">{t("reportFactsHeading")}</h2>
        {report.businessFactsLearned.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              No new business facts were recorded during this session.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-3">
              <div className="divide-y">
                {report.businessFactsLearned.map((f) => (
                  <div key={f.id} className="py-2 flex items-start gap-3 text-sm">
                    <span className="w-44 text-muted-foreground truncate" title={f.key}>
                      {f.key}
                    </span>
                    <span className="flex-1">{f.value.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* By category */}
      {report.totals.byCategory.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium mb-2">By category</h2>
          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                {report.totals.byCategory.map((c) => (
                  <div key={c.code} className="py-2 flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <Badge variant="outline">{c.count}</Badge>
                    <span className="w-28 text-right tabular-nums">{formatMoney(c.amount, ccy)}</span>
                    <span className="w-40 text-xs text-muted-foreground truncate">{c.taxFormRef ?? ""}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  isZero = false,
}: {
  label: string
  value: string
  tone: "emerald" | "amber" | "muted" | "primary" | "personalTaxable"
  /** When true, render the value in the muted palette regardless of tone —
   * so empty Deductible/Non-deductible cards on a personal session don't
   * visually read as "something is wrong". */
  isZero?: boolean
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
    primary: "text-primary",
    personalTaxable: "text-amber-700 dark:text-amber-300",
  }
  const colorClass = isZero ? "text-muted-foreground/60" : toneClasses[tone]
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function RollupRow({
  label,
  amount,
  count,
  pending,
  pendingLabel,
}: {
  label: string
  amount: string
  count: number | null
  pending?: number
  pendingLabel?: string | null
}) {
  return (
    <div className="py-2 flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== null ? <Badge variant="outline">{count}</Badge> : null}
      <span className="w-28 text-right tabular-nums">{amount}</span>
      {pending && pending > 0 && pendingLabel ? (
        <span className="w-44 text-xs text-amber-600 dark:text-amber-400 truncate">
          {pendingLabel}
        </span>
      ) : (
        <span className="w-44 text-xs text-muted-foreground" />
      )}
    </div>
  )
}

function StatusRow({
  label,
  value,
  ccy,
}: {
  label: string
  value: { count: number; amount: number } | undefined
  ccy: string
}) {
  const count = value?.count ?? 0
  const amount = value?.amount ?? 0
  return (
    <div className="py-2 flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Badge variant="outline">{count}</Badge>
      <span className="w-28 text-right tabular-nums">{formatMoney(amount, ccy)}</span>
    </div>
  )
}

function CommitDiagnostics({ report }: { report: SessionReport }) {
  const created = report.session.commitCreatedCount
  const errors = report.session.commitErrors ?? []
  const navigate = useNavigate()
  const confirm = useConfirm()

  const reopen = trpc.wizard.reopenCommitted.useMutation({
    onSuccess: ({ rowCount }) => {
      toast.success(`Reopened session with ${rowCount} row${rowCount === 1 ? "" : "s"}. Review and commit again.`)
      navigate({ to: `/wizard/${report.session.id}` as string })
    },
    onError: (err) => toast.error(err.message),
  })

  const diagnosticsAvailable = created !== null && created !== undefined
  const hadFailures = diagnosticsAvailable && errors.length > 0
  // Older committed sessions never captured diagnostics but may still have
  // zero landed rows. When the UI already knows the transactions list is
  // empty for this session, we still want to expose the retry path. The
  // button is also safe to click blindly — the dedupe check runs at commit.
  const noDiagnosticsButNothingLanded = !diagnosticsAvailable
  const showBanner = hadFailures || noDiagnosticsButNothingLanded

  if (!showBanner) return null

  // Group identical messages so "23 rows: duplicate key" collapses.
  const groups = new Map<string, number[]>()
  for (const e of errors) {
    const list = groups.get(e.message) ?? []
    list.push(e.rowIndex)
    groups.set(e.message, list)
  }

  const onReopen = async () => {
    const ok = await confirm({
      title: "Reopen this session for retry?",
      description:
        "Flips status back to pending, re-selects every row, and clears the commit diagnostics. Already-committed rows from this session (if any) stay in the transactions table — duplicate detection will flag them on the next commit.",
      confirmLabel: "Reopen for retry",
    })
    if (!ok) return
    reopen.mutate({ sessionId: report.session.id })
  }

  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="space-y-2 min-w-0 flex-1">
          <div className="font-medium">
            {hadFailures ? (
              <>
                {errors.length} row{errors.length === 1 ? "" : "s"} failed to commit
                {" · "}
                {created} of {report.session.rowCount} transactions actually landed.
              </>
            ) : (
              <>
                This session was committed before the diagnostics were added — the
                category counts below come from the candidate snapshot, not the
                transactions table. If nothing shows up on the transactions page,
                reopen and re-commit.
              </>
            )}
          </div>
          {hadFailures ? (
            <div className="text-xs text-amber-900/80 dark:text-amber-200/80">
              The session report's category counts come from the candidate snapshot, not
              the transactions table — these are the rows that threw when we tried to
              insert them.
            </div>
          ) : null}
          {hadFailures ? (
            <ul className="space-y-1 pl-1">
              {Array.from(groups.entries()).map(([message, rowIndexes]) => (
                <li key={message} className="text-xs">
                  <span className="font-mono text-amber-900 dark:text-amber-200">
                    rows {rowIndexes.slice(0, 10).map((i) => `#${i}`).join(", ")}
                    {rowIndexes.length > 10 ? ` and ${rowIndexes.length - 10} more` : ""}
                  </span>
                  {" · "}
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={onReopen}
              disabled={reopen.isPending}
              className="mt-1"
            >
              {reopen.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Reopen for retry
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}
