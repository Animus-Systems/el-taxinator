import { useParams } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, PartyPopper, FileText, PlusCircle, Lightbulb, Sparkles, Loader2, History } from "lucide-react"
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
    <div className="mx-auto max-w-4xl space-y-6 py-4">
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
            {report.totals.byStatus["personal_ignored"]?.count ?? 0} personal
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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label={t("reportTotalsHeading") + " — deductible"}
          value={formatMoney(report.totals.deductibleTotal, ccy)}
          tone="emerald"
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — non-deductible"}
          value={formatMoney(report.totals.nonDeductibleTotal, ccy)}
          tone="amber"
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — personal"}
          value={formatMoney(report.totals.personalTotal, ccy)}
          tone="muted"
        />
        <SummaryCard
          label={t("reportTotalsHeading") + " — grand"}
          value={formatMoney(report.totals.grandTotal, ccy)}
          tone="primary"
        />
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
}: {
  label: string
  value: string
  tone: "emerald" | "amber" | "muted" | "primary"
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
    primary: "text-primary",
  }
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${toneClasses[tone]}`}>{value}</div>
      </CardContent>
    </Card>
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
