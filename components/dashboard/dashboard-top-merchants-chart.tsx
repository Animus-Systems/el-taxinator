"use client"

import type { ActiveElement, ChartData, ChartOptions, TooltipItem } from "chart.js"
import { Bar } from "react-chartjs-2"
import { Store } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardEmptyPanel } from "./dashboard-empty-panel"
import {
  createDashboardBarChartOptions,
  dashboardChartTheme,
  registerDashboardChartJs,
  type DashboardMerchantBreakdownPoint,
} from "./dashboard-chart-theme"
import { cn, formatCurrency } from "@/lib/utils"

registerDashboardChartJs()

const UNLABELED_MERCHANT_SENTINEL = "__unlabeled__"

export type DashboardTopMerchantsChartProps = {
  data: DashboardMerchantBreakdownPoint[]
  defaultCurrency: string
  title?: string
  description?: string
  className?: string
  onMerchantClick?: (merchant: DashboardMerchantBreakdownPoint) => void
}

export function DashboardTopMerchantsChart({
  data,
  defaultCurrency,
  title,
  description,
  className,
  onMerchantClick,
}: DashboardTopMerchantsChartProps) {
  const { t } = useTranslation("dashboard")
  const resolvedTitle = title ?? t("topMerchants")
  const resolvedDescription = description ?? t("topMerchantsDescription")
  const expensesLabel = t("seriesExpenses")
  const unlabeledLabel = t("unlabeledMerchant")

  const displayData = data.map((item) => ({
    ...item,
    displayName: item.merchant === UNLABELED_MERCHANT_SENTINEL ? unlabeledLabel : item.merchant,
  }))
  const hasData = displayData.length > 0 && displayData.some((item) => item.expenses > 0)

  if (!hasData) {
    return (
      <DashboardEmptyPanel
        className={className}
        title={resolvedTitle}
        description={resolvedDescription}
        icon={<Store className="h-5 w-5" />}
      />
    )
  }

  const chartData: ChartData<"bar"> = {
    labels: displayData.map((item) => item.displayName),
    datasets: [
      {
        label: expensesLabel,
        data: displayData.map((item) => item.expenses),
        backgroundColor: displayData.map((_, index) =>
          index === 0 ? dashboardChartTheme.colors.expense : dashboardChartTheme.colors.coral,
        ),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 28,
      },
    ],
  }

  const baseOptions = createDashboardBarChartOptions(true)
  const xScale = baseOptions.scales?.["x"]
  const yScale = baseOptions.scales?.["y"]
  const options: ChartOptions<"bar"> = {
    ...baseOptions,
    onClick: (_event: unknown, elements: ActiveElement[]) => {
      const element = elements[0]
      if (!element || !onMerchantClick) return
      const merchant = data[element.index]
      // Clicking the unlabeled bucket can't deep-link into a useful search —
      // there's no merchant/name value to filter on — so suppress the callback.
      if (merchant && merchant.merchant !== UNLABELED_MERCHANT_SENTINEL) {
        onMerchantClick(merchant)
      }
    },
    scales: {
      ...baseOptions.scales,
      x: {
        ...xScale,
        ticks: {
          ...xScale?.ticks,
          callback: (value: string | number) => formatCurrency(Number(value), defaultCurrency),
        },
      },
      y: {
        ...yScale,
        ticks: {
          ...yScale?.ticks,
          autoSkip: false,
        },
      },
    },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (tooltipItem: TooltipItem<"bar">) => {
            const value = Number(tooltipItem.parsed["x"] ?? 0)
            return `${tooltipItem.label ?? unlabeledLabel}: ${formatCurrency(value, defaultCurrency)}`
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
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="h-[280px]">
          <Bar data={chartData} options={options} />
        </div>
        <div className="space-y-3">
          {displayData.map((merchant, index) => {
            const isUnlabeled = merchant.merchant === UNLABELED_MERCHANT_SENTINEL
            return (
              <button
                key={merchant.merchant}
                type="button"
                onClick={() => {
                  if (isUnlabeled) return
                  onMerchantClick?.(merchant)
                }}
                disabled={isUnlabeled}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-left transition",
                  isUnlabeled
                    ? "cursor-default opacity-70"
                    : "hover:border-slate-300 hover:bg-white",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{merchant.displayName}</div>
                  <div className="text-xs text-slate-500">
                    {t("merchantTransactions", { count: merchant.transactionCount })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(merchant.expenses, defaultCurrency)}
                  </div>
                  <div className="text-xs text-slate-500">#{index + 1}</div>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
