"use client"

import type { ActiveElement, ChartData, ChartOptions, TooltipItem } from "chart.js"
import { Line } from "react-chartjs-2"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardEmptyPanel } from "./dashboard-empty-panel"
import {
  createDashboardLineChartOptions,
  dashboardChartTheme,
  formatDashboardPeriodLabel,
  registerDashboardChartJs,
  type DashboardTimeSeriesPoint,
} from "./dashboard-chart-theme"
import { cn, formatCurrency } from "@/lib/utils"

registerDashboardChartJs()

export type DashboardOtherCurrency = {
  currency: string
  transactionCount: number
}

export type DashboardHeroChartProps = {
  data: DashboardTimeSeriesPoint[]
  defaultCurrency: string
  title?: string
  description?: string
  className?: string
  otherCurrencies?: DashboardOtherCurrency[]
  onPointClick?: (point: DashboardTimeSeriesPoint, series: "income" | "expenses" | "net") => void
}

function getLatestSummary(data: DashboardTimeSeriesPoint[]) {
  const latest = data.at(-1)
  if (!latest) return null

  return {
    label: formatDashboardPeriodLabel(latest.period, latest.date),
    income: latest.income,
    expenses: latest.expenses,
    net: latest.income - latest.expenses,
  }
}

export function DashboardHeroChart({
  data,
  defaultCurrency,
  title,
  description,
  className,
  otherCurrencies = [],
  onPointClick,
}: DashboardHeroChartProps) {
  const { t } = useTranslation("dashboard")
  const resolvedTitle = title ?? t("cashFlowOverTime")
  const resolvedDescription = description ?? t("cashFlowDescription")
  const incomeLabel = t("seriesIncome")
  const expensesLabel = t("seriesExpenses")
  const netLabel = t("seriesNet")
  const hasData = data.length > 0
  const hasMovement = data.some((point) => point.income !== 0 || point.expenses !== 0)
  const latest = getLatestSummary(data)
  const otherCurrenciesTotalCount = otherCurrencies.reduce(
    (sum, entry) => sum + entry.transactionCount,
    0,
  )

  if (!hasData || !hasMovement) {
    return (
      <DashboardEmptyPanel
        className={className}
        title={resolvedTitle}
        description={resolvedDescription}
      />
    )
  }

  const labels = data.map((point) => formatDashboardPeriodLabel(point.period, point.date))
  const chartData: ChartData<"line"> = {
    labels,
    datasets: [
      {
        label: incomeLabel,
        data: data.map((point) => point.income),
        borderColor: dashboardChartTheme.colors.positive,
        backgroundColor: dashboardChartTheme.colors.positiveSoft,
        pointBackgroundColor: dashboardChartTheme.colors.positive,
        pointBorderColor: dashboardChartTheme.colors.panel,
        tension: 0.35,
        fill: true,
      },
      {
        label: expensesLabel,
        data: data.map((point) => point.expenses),
        borderColor: dashboardChartTheme.colors.expense,
        backgroundColor: dashboardChartTheme.colors.expenseSoft,
        pointBackgroundColor: dashboardChartTheme.colors.expense,
        pointBorderColor: dashboardChartTheme.colors.panel,
        tension: 0.35,
        fill: true,
      },
      {
        label: netLabel,
        data: data.map((point) => point.income - point.expenses),
        borderColor: dashboardChartTheme.colors.slate,
        backgroundColor: "rgba(51, 65, 85, 0.12)",
        pointBackgroundColor: dashboardChartTheme.colors.slate,
        pointBorderColor: dashboardChartTheme.colors.panel,
        tension: 0.35,
        fill: true,
      },
    ],
  }

  const baseOptions = createDashboardLineChartOptions()
  const yScale = baseOptions.scales?.["y"]
  const options: ChartOptions<"line"> = {
    ...baseOptions,
    onClick: (_event: unknown, elements: ActiveElement[]) => {
      const element = elements[0]
      if (!element || !onPointClick) return

      const point = data[element.index]
      if (!point) return

      const series = (["income", "expenses", "net"] as const)[element.datasetIndex] ?? "net"
      onPointClick(point, series)
    },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (tooltipItem: TooltipItem<"line">) => {
            const series = tooltipItem.dataset.label ?? netLabel
            return `${series}: ${formatCurrency(Number(tooltipItem.parsed["y"] ?? 0), defaultCurrency)}`
          },
        },
      },
      legend: {
        ...baseOptions.plugins?.legend,
        position: "bottom",
      },
    },
    scales: {
      ...baseOptions.scales,
      y: {
        ...yScale,
        ticks: {
          ...yScale?.ticks,
          callback: (value: string | number) => formatCurrency(Number(value), defaultCurrency),
        },
      },
    },
  }

  return (
    <Card className={cn("border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-slate-100/70 shadow-sm", className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl text-slate-950">{resolvedTitle}</CardTitle>
            <CardDescription>{resolvedDescription}</CardDescription>
          </div>
          {latest ? (
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-right shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">{t("latestPeriod")}</div>
              <div className="text-sm font-medium text-slate-900">{latest.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                {netLabel} {formatCurrency(latest.net, defaultCurrency)}
              </div>
            </div>
          ) : null}
        </div>
        {latest ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {incomeLabel} {formatCurrency(latest.income, defaultCurrency)}
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              {expensesLabel} {formatCurrency(latest.expenses, defaultCurrency)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              {netLabel} {formatCurrency(latest.net, defaultCurrency)}
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-[360px] w-full">
          <Line data={chartData} options={options} />
        </div>
        {otherCurrenciesTotalCount > 0 ? (
          <p className="text-xs text-slate-500">
            {t("otherCurrenciesNote", {
              count: otherCurrenciesTotalCount,
              currencies: otherCurrencies.map((entry) => entry.currency).join(", "),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
