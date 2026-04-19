import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { AlertTriangle, Check, FileText, Link as LinkIcon, Loader2, Unlink } from "lucide-react"

type Props = {
  sourceId: string
  year: number
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const

// One hue per month so a row's leading stripe matches the month tile it came
// from. Offset by 15° and stepped by 30° gives 12 distinct but calm colours.
function monthHue(month: number): number {
  return ((month - 1) * 30 + 15) % 360
}

type MonthStyle = {
  background: string
  border: string
  text: string
  stripe: string
}

function monthColor(month: number, hasData: boolean): MonthStyle {
  if (!hasData) {
    return {
      background: "transparent",
      border: "hsl(220 15% 85%)",
      text: "hsl(220 10% 55%)",
      stripe: "hsl(220 15% 88%)",
    }
  }
  const hue = monthHue(month)
  return {
    background: `hsla(${hue}, 70%, 55%, 0.15)`,
    border: `hsla(${hue}, 70%, 45%, 0.55)`,
    text: `hsl(${hue}, 55%, 30%)`,
    stripe: `hsla(${hue}, 70%, 50%, 0.9)`,
  }
}

export function EmployerDetailPanel({ sourceId, year }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  const { data, isLoading } = trpc.incomeSources.detail.useQuery({ id: sourceId, year })
  const { data: suggestions = [] } = trpc.incomeSources.suggestLinks.useQuery({
    id: sourceId,
    year,
  })

  const link = trpc.incomeSources.linkTransaction.useMutation({
    onSuccess: () => {
      utils.incomeSources.detail.invalidate({ id: sourceId, year })
      utils.incomeSources.suggestLinks.invalidate({ id: sourceId, year })
      utils.incomeSources.totals.invalidate({ year })
    },
  })
  const unlink = trpc.incomeSources.unlinkTransaction.useMutation({
    onSuccess: () => {
      utils.incomeSources.detail.invalidate({ id: sourceId, year })
      utils.incomeSources.suggestLinks.invalidate({ id: sourceId, year })
      utils.incomeSources.totals.invalidate({ year })
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("personal.loading")}
      </div>
    )
  }

  const { transactions, monthly, completeness } = data

  const completenessChips: Array<{ key: string; label: string; tone: "warn" | "ok" }> = []
  if (completeness.missingNif) {
    completenessChips.push({
      key: "nif",
      label: t("personal.employment.detail.chipMissingNif"),
      tone: "warn",
    })
  }
  if (completeness.monthsMissingPayslip > 0) {
    completenessChips.push({
      key: "months",
      label: t("personal.employment.detail.chipMonthsMissingPayslip", {
        count: completeness.monthsMissingPayslip,
      }),
      tone: "warn",
    })
  }
  if (completeness.depositsMissingPayslip > 0) {
    completenessChips.push({
      key: "deposits",
      label: t("personal.employment.detail.chipDepositsMissingPayslip", {
        count: completeness.depositsMissingPayslip,
      }),
      tone: "warn",
    })
  }
  if (!completeness.totalIrpfExtracted && transactions.length > 0) {
    completenessChips.push({
      key: "irpf",
      label: t("personal.employment.detail.chipNoIrpf"),
      tone: "warn",
    })
  }
  if (completenessChips.length === 0 && transactions.length > 0) {
    completenessChips.push({
      key: "ok",
      label: t("personal.employment.detail.chipComplete"),
      tone: "ok",
    })
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {/* Completeness strip */}
        {completenessChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {completenessChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="outline"
                className={
                  chip.tone === "warn"
                    ? "gap-1 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px]"
                    : "gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px]"
                }
              >
                {chip.tone === "warn" ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                {chip.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {/* 12-month grid */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            {t("personal.employment.detail.monthlyOverview", { year })}
          </h3>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
            {monthly.map((m, i) => {
              const monthKey = MONTH_KEYS[i]
              const monthLabel = monthKey ? t(`personal.employment.detail.month.${monthKey}`) : String(m.month)
              const hasData = m.depositCount > 0
              const color = monthColor(m.month, hasData)
              const incomplete = hasData && m.withPayslipCount < m.depositCount
              const isSelected = selectedMonth === m.month
              return (
                <button
                  type="button"
                  key={m.month}
                  onClick={() => setSelectedMonth(isSelected ? null : m.month)}
                  disabled={!hasData}
                  className="relative rounded-md px-2 py-2 text-center text-[10px] border transition-all enabled:hover:brightness-110 enabled:cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: isSelected && hasData
                      ? color.background.replace("0.15", "0.35")
                      : color.background,
                    borderColor: isSelected && hasData ? color.stripe : color.border,
                    borderWidth: isSelected && hasData ? 2 : 1,
                    color: color.text,
                  }}
                  title={
                    hasData
                      ? t("personal.employment.detail.monthTooltip", {
                          deposits: m.depositCount,
                          payslips: m.withPayslipCount,
                          gross: formatCurrency(m.grossCents, "EUR"),
                        })
                      : t("personal.employment.detail.monthEmpty")
                  }
                >
                  {incomplete ? (
                    <span
                      className="absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "hsl(32 95% 50%)" }}
                      aria-hidden
                    />
                  ) : null}
                  <div className="font-medium uppercase tracking-wide">{monthLabel}</div>
                  <div className="tabular-nums mt-0.5">
                    {hasData ? `${m.withPayslipCount}/${m.depositCount}` : "—"}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {t("personal.employment.detail.monthLegendColor")}
          </p>
        </div>

        {/* Linked transactions */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            {t("personal.employment.detail.linkedTransactions", { count: transactions.length })}
          </h3>
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-center text-xs text-muted-foreground">
                {t("personal.employment.detail.noLinkedYet")}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="w-1 p-0"></th>
                    <th className="px-2 py-1.5 text-left font-medium">
                      {t("personal.employment.detail.colDate")}
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium">
                      {t("personal.employment.detail.colDescription")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {t("personal.employment.detail.colGross")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {t("personal.employment.detail.colIrpf")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {t("personal.employment.detail.colNet")}
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      {t("personal.employment.detail.colPayslip")}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const firstFile = tx.fileIds[0]
                    const month = new Date(tx.issuedAt).getUTCMonth() + 1
                    const color = monthColor(month, true)
                    const isSelected = selectedMonth === month
                    const isDimmed = selectedMonth !== null && !isSelected
                    return (
                      <tr
                        key={tx.id}
                        className="border-t transition-all"
                        style={{
                          backgroundColor: isSelected ? color.background : undefined,
                          opacity: isDimmed ? 0.4 : 1,
                        }}
                      >
                        <td
                          className="w-1 p-0"
                          style={{ backgroundColor: color.stripe }}
                          title={t(`personal.employment.detail.month.${MONTH_KEYS[month - 1]}`)}
                        ></td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {tx.issuedAt.slice(0, 10)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="truncate max-w-[280px]">
                            {tx.merchant ?? tx.name ?? tx.description ?? "—"}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {tx.grossCents != null
                            ? formatCurrency(tx.grossCents, tx.currencyCode)
                            : formatCurrency(tx.total, tx.currencyCode)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {tx.irpfWithheldCents != null && tx.irpfWithheldCents > 0
                            ? formatCurrency(tx.irpfWithheldCents, tx.currencyCode)
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatCurrency(tx.total, tx.currencyCode)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {firstFile ? (
                            <a
                              href={`/files/view/${firstFile}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <FileText className="h-3 w-3" />
                              {t("personal.employment.detail.viewPayslip")}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => unlink.mutate({ transactionId: tx.id })}
                            disabled={unlink.isPending}
                            title={t("personal.employment.detail.unlink")}
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Suggested links */}
        {suggestions.length > 0 ? (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              {t("personal.employment.detail.suggestedLinksTitle", { count: suggestions.length })}
            </h3>
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {suggestions.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="tabular-nums text-muted-foreground">
                        {s.issuedAt.slice(0, 10)}
                      </span>
                      <span className="flex-1 truncate">
                        {s.merchant ?? s.description ?? "—"}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`personal.employment.detail.matchReason.${s.matchReason}`)}
                      </Badge>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(s.total, s.currencyCode)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => link.mutate({ sourceId, transactionId: s.id })}
                        disabled={link.isPending}
                      >
                        <LinkIcon className="h-3 w-3" />
                        {t("personal.employment.detail.linkAction")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
