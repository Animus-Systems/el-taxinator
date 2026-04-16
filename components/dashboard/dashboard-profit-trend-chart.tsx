"use client"

import type { ActiveElement, ChartData, ChartOptions, TooltipItem } from "chart.js"
import { Line } from "react-chartjs-2"
import { TrendingUp } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardEmptyPanel } from "./dashboard-empty-panel"
import {
  createDashboardLineChartOptions,
  dashboardChartTheme,
  formatDashboardPeriodLabel,
  registerDashboardChartJs,
  type DashboardProfitTrendPoint,
} from "./dashboard-chart-theme"
import { cn, formatCurrency } from "@/lib/utils"

registerDashboardChartJs()

export type DashboardProfitTrendChartProps = {
  data: DashboardProfitTrendPoint[]
  defaultCurrency: string
  title?: string
  description?: string
  className?: string
  onPointClick?: (point: DashboardProfitTrendPoint) => void
}

export function DashboardProfitTrendChart({
  data,
  defaultCurrency,
  title = "Monthly profit trend",
  description = "The direction of business profit over time.",
  className,
  onPointClick,
}: DashboardProfitTrendChartProps) {
  const hasData = data.length > 0 && data.some((item) => item.profit !== 0)

  if (!hasData) {
    return (
      <DashboardEmptyPanel
        className={className}
        title={title}
        description={description}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    )
  }

  const chartData: ChartData<"line"> = {
    labels: data.map((point) => formatDashboardPeriodLabel(point.period, point.date)),
    datasets: [
      {
        label: "Profit",
        data: data.map((point) => point.profit),
        borderColor: dashboardChartTheme.colors.slate,
        backgroundColor: "rgba(51, 65, 85, 0.12)",
        pointBackgroundColor: data.map((point) =>
          point.profit >= 0 ? dashboardChartTheme.colors.positive : dashboardChartTheme.colors.expense,
        ),
        pointBorderColor: dashboardChartTheme.colors.panel,
        pointBorderWidth: 2,
        fill: true,
        tension: 0.35,
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
      if (point) onPointClick(point)
    },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (tooltipItem: TooltipItem<"line">) => {
            const value = Number(tooltipItem.parsed["y"] ?? 0)
            return `Profit: ${formatCurrency(value, defaultCurrency)}`
          },
        },
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

  const latest = data.at(-1)

  return (
    <Card className={cn("border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/70 shadow-sm", className)}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl text-slate-950">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {latest ? (
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-right shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Latest profit</div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  latest.profit >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {formatCurrency(latest.profit, defaultCurrency)}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  )
}
