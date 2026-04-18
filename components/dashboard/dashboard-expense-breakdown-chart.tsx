"use client"

import type { ActiveElement, ChartData, ChartOptions, TooltipItem } from "chart.js"
import { Doughnut } from "react-chartjs-2"
import { BarChart3 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardEmptyPanel } from "./dashboard-empty-panel"
import {
  createDashboardDoughnutChartOptions,
  dashboardChartTheme,
  getDashboardCategoryColor,
  registerDashboardChartJs,
  type DashboardCategoryBreakdownPoint,
} from "./dashboard-chart-theme"
import { cn, formatCurrency } from "@/lib/utils"

registerDashboardChartJs()

export type DashboardExpenseBreakdownChartProps = {
  data: DashboardCategoryBreakdownPoint[]
  defaultCurrency: string
  title?: string
  description?: string
  className?: string
  onCategoryClick?: (category: DashboardCategoryBreakdownPoint) => void
}

export function DashboardExpenseBreakdownChart({
  data,
  defaultCurrency,
  title,
  description,
  className,
  onCategoryClick,
}: DashboardExpenseBreakdownChartProps) {
  const { t } = useTranslation("dashboard")
  const resolvedTitle = title ?? t("expenseBreakdown")
  const resolvedDescription = description ?? t("expenseBreakdownDescription")
  const expensesLabel = t("seriesExpenses")
  const totalExpenses = data.reduce((sum, item) => sum + item.expenses, 0)
  const hasData = data.length > 0 && totalExpenses > 0

  if (!hasData) {
    return (
      <DashboardEmptyPanel
        className={className}
        title={resolvedTitle}
        description={resolvedDescription}
        icon={<BarChart3 className="h-5 w-5" />}
      />
    )
  }

  const labels = data.map((item) => item.name)
  const chartData: ChartData<"doughnut"> = {
    labels,
    datasets: [
      {
        label: expensesLabel,
        data: data.map((item) => item.expenses),
        backgroundColor: data.map((item, index) => item.color || getDashboardCategoryColor(item.code, index)),
        borderColor: dashboardChartTheme.colors.panel,
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  }

  const baseOptions = createDashboardDoughnutChartOptions()
  const options: ChartOptions<"doughnut"> = {
    ...baseOptions,
    onClick: (_event: unknown, elements: ActiveElement[]) => {
      const element = elements[0]
      if (!element || !onCategoryClick) return
      const category = data[element.index]
      if (category) onCategoryClick(category)
    },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (tooltipItem: TooltipItem<"doughnut">) => {
            const value = Number(tooltipItem.parsed ?? 0)
            return `${tooltipItem.label ?? "Other"}: ${formatCurrency(value, defaultCurrency)}`
          },
        },
      },
    },
  }

  return (
    <Card className={cn("border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/70 shadow-sm", className)}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl text-slate-950">{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
        <div className="text-sm text-slate-600">
          {t("totalSpend")} {formatCurrency(totalExpenses, defaultCurrency)}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="mx-auto h-[240px] w-full max-w-[240px]">
          <Doughnut data={chartData} options={options} />
        </div>
        <div className="space-y-3">
          {data.map((category, index) => {
            const color = category.color || getDashboardCategoryColor(category.code, index)
            const percent = totalExpenses > 0 ? Math.round((category.expenses / totalExpenses) * 100) : 0

            return (
              <button
                key={category.code}
                type="button"
                onClick={() => onCategoryClick?.(category)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{category.name}</div>
                    <div className="text-xs text-slate-500">
                      {t("merchantTransactions", { count: category.transactionCount })}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(category.expenses, defaultCurrency)}
                  </div>
                  <div className="text-xs text-slate-500">{percent}%</div>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
