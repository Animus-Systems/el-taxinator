import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn, formatCurrency } from "@/lib/utils"
import { AlertCircle, ArrowDownRight, ArrowUpRight, Info } from "lucide-react"

type Props = { year: number }

/**
 * Ballpark Modelo 100 (IRPF) summary for the viewed year. Uses simplified
 * state + average autonomous-community brackets; see
 * `models/personal-tax-estimate.ts` for the approximation notes.
 */
export function PersonalTaxSummary({ year }: Props) {
  const { t } = useTranslation("tax")
  const { data, isLoading } = trpc.personalTax.estimate.useQuery({ year })

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          {t("personal.loading")}
        </CardContent>
      </Card>
    )
  }

  const hasAnyIncome =
    data.salaryGrossCents + data.rentalGrossCents + data.dividendGrossCents +
    data.interestGrossCents + data.cryptoRealizedGainCents > 0

  if (!hasAnyIncome) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4 text-xs text-muted-foreground">
          <Info className="h-4 w-4" />
          {t("personal.summary.noIncomeYet")}
        </CardContent>
      </Card>
    )
  }

  const owes = data.resultCents > 0
  const refund = data.resultCents < 0
  const settled = data.resultCents === 0

  const resultToneClass = owes
    ? "text-red-600 dark:text-red-400"
    : refund
      ? "text-green-600 dark:text-green-400"
      : "text-muted-foreground"

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{t("personal.summary.title", { year })}</h3>
              <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                {t("personal.summary.estimateOnly")}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("personal.summary.disclaimer")}
            </p>
          </div>
          <div className="text-right">
            <div className={cn("flex items-center gap-1 justify-end text-xl font-semibold tabular-nums", resultToneClass)}>
              {owes ? <ArrowUpRight className="h-5 w-5" /> : refund ? <ArrowDownRight className="h-5 w-5" /> : null}
              {formatCurrency(Math.abs(data.resultCents), "EUR")}
            </div>
            <div className={cn("text-[11px] font-medium", resultToneClass)}>
              {owes
                ? t("personal.summary.estimatedToPay")
                : refund
                  ? t("personal.summary.estimatedRefund")
                  : t("personal.summary.estimatedZero")}
            </div>
            {settled ? null : (
              <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                {t("personal.summary.cuotaMinusWithheld", {
                  cuota: formatCurrency(data.cuotaLiquidaCents, "EUR"),
                  withheld: formatCurrency(data.totalWithheldCents, "EUR"),
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 border-t pt-3">
          <SummaryTile
            label={t("personal.summary.generalBase")}
            value={formatCurrency(data.generalBaseCents, "EUR")}
            sub={t("personal.summary.generalBaseSub", {
              cuota: formatCurrency(data.generalCuotaCents, "EUR"),
            })}
          />
          <SummaryTile
            label={t("personal.summary.savingsBase")}
            value={formatCurrency(data.savingsBaseCents, "EUR")}
            sub={t("personal.summary.savingsBaseSub", {
              cuota: formatCurrency(data.savingsCuotaCents, "EUR"),
            })}
          />
          <SummaryTile
            label={t("personal.summary.totalCuota")}
            value={formatCurrency(data.cuotaLiquidaCents, "EUR")}
            sub={
              data.deductionCuotaCreditCents > 0
                ? t("personal.summary.afterCredits", {
                    credits: formatCurrency(data.deductionCuotaCreditCents, "EUR"),
                  })
                : t("personal.summary.noCredits")
            }
          />
          <SummaryTile
            label={t("personal.summary.totalWithheld")}
            value={formatCurrency(data.totalWithheldCents, "EUR")}
            sub={t("personal.summary.totalWithheldSub")}
          />
        </div>

        <div className="border-t pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
            {t("personal.summary.breakdownTitle")}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs md:grid-cols-3">
            <BreakdownRow label={t("personal.employment.title")} amount={data.salaryGrossCents} />
            <BreakdownRow label={t("personal.rental.title")} amount={data.rentalGrossCents} />
            <BreakdownRow label={t("personal.dividend.title")} amount={data.dividendGrossCents} />
            <BreakdownRow label={t("personal.interest.title")} amount={data.interestGrossCents} />
            <BreakdownRow
              label={t("personal.investments.title")}
              amount={data.cryptoRealizedGainCents}
            />
            {data.deductionBaseReductionCents > 0 || data.deductionCuotaCreditCents > 0 ? (
              <BreakdownRow
                label={t("personal.deductions.title")}
                amount={-(data.deductionBaseReductionCents + data.deductionCuotaCreditCents)}
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function BreakdownRow({ label, amount }: { label: string; amount: number }) {
  if (amount === 0) return null
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums font-medium", amount < 0 ? "text-muted-foreground" : "")}>
        {amount < 0 ? "−" : ""}{formatCurrency(Math.abs(amount), "EUR")}
      </span>
    </div>
  )
}
