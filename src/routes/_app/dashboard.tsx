import { useMemo, useState } from "react"
import { format, subMonths } from "date-fns"
import type { DateRange } from "react-day-picker"
import { useTranslation } from "react-i18next"

import { trpc } from "~/trpc"
import { DateRangePicker } from "@/components/forms/date-range-picker"
import { DashboardEmptyPanel } from "@/components/dashboard/dashboard-empty-panel"
import { DashboardExpenseBreakdownChart } from "@/components/dashboard/dashboard-expense-breakdown-chart"
import { DashboardHeroChart } from "@/components/dashboard/dashboard-hero-chart"
import { DashboardKpiRow } from "@/components/dashboard/dashboard-kpi-row"
import { DashboardProfitTrendChart } from "@/components/dashboard/dashboard-profit-trend-chart"
import { DashboardTopMerchantsChart } from "@/components/dashboard/dashboard-top-merchants-chart"
import { buildDashboardDrilldownHref } from "@/components/dashboard/dashboard-drilldown"
import { useRouter } from "@/lib/navigation"
import { formatCurrency } from "@/lib/utils"

function formatDateRangeForFilters(range: DateRange | undefined) {
  return {
    dateFrom: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
    dateTo: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
  }
}

function formatCurrencyTotals(totals: Record<string, number>, fallbackCurrency: string) {
  const values = Object.entries(totals).map(([currency, total]) => formatCurrency(total, currency))
  return values.length > 0 ? values.join(" · ") : formatCurrency(0, fallbackCurrency)
}

export function DashboardPage() {
  const { t } = useTranslation("dashboard")
  const router = useRouter()
  const [range, setRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: new Date(),
  })

  const filters = useMemo(() => formatDateRangeForFilters(range), [range])
  const settingsQuery = trpc.settings.get.useQuery({})
  const defaultCurrency = settingsQuery.data?.["default_currency"] ?? "EUR"

  const statsQuery = trpc.stats.dashboard.useQuery(filters)
  const analyticsQuery = trpc.stats.analytics.useQuery({
    ...filters,
    currency: defaultCurrency,
  })

  if (statsQuery.isLoading || analyticsQuery.isLoading) {
    // Settings query can still be in flight — we gracefully fall back to EUR
    // for `defaultCurrency`, so there's no need to block first paint on it.
    return (
      <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
        {t("loading")}
      </div>
    )
  }

  if (statsQuery.error || analyticsQuery.error) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5">
        <DashboardEmptyPanel
          title={t("errorTitle")}
          description={t("errorDescription")}
        />
      </div>
    )
  }

  const stats = statsQuery.data
  const analytics = analyticsQuery.data

  if (!stats || !analytics) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5">
        <DashboardEmptyPanel
          title={t("emptyAnalyticsTitle")}
          description={t("emptyAnalyticsDescription")}
        />
      </div>
    )
  }

  const dateFilters = formatDateRangeForFilters(range)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{t("title")}</h1>
          <p className="max-w-3xl text-sm text-slate-600">{t("controlRoomSubtitle")}</p>
        </div>
        <DateRangePicker
          {...(range ? { defaultDate: range } : { defaultRange: "last-12-months" })}
          onChange={(nextRange) => setRange(nextRange)}
        />
      </header>

      <DashboardKpiRow
        items={[
          {
            label: t("totalIncome"),
            value: formatCurrencyTotals(stats.totalIncomePerCurrency, defaultCurrency),
            tone: "positive",
            href: buildDashboardDrilldownHref({ ...dateFilters, type: "income" }),
          },
          {
            label: t("totalExpenses"),
            value: formatCurrencyTotals(stats.totalExpensesPerCurrency, defaultCurrency),
            tone: "negative",
            href: buildDashboardDrilldownHref({ ...dateFilters, type: "expense" }),
          },
          {
            label: t("netProfit"),
            value: formatCurrencyTotals(stats.profitPerCurrency, defaultCurrency),
            tone: Object.values(stats.profitPerCurrency).some((total) => total < 0) ? "negative" : "positive",
            href: buildDashboardDrilldownHref(dateFilters),
          },
          {
            label: t("processedTransactions"),
            value: String(stats.invoicesProcessed),
            tone: "neutral",
            href: buildDashboardDrilldownHref(dateFilters),
          },
        ]}
      />

      <DashboardHeroChart
        data={analytics.timeSeries}
        defaultCurrency={defaultCurrency}
        title={t("cashFlowOverTime")}
        description={t("cashFlowDescription")}
        otherCurrencies={analytics.otherCurrencies}
        onPointClick={(point, series) => {
          router.push(
            buildDashboardDrilldownHref({
              period: point.period,
              type: series === "income" ? "income" : series === "expenses" ? "expense" : undefined,
            }),
          )
        }}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <DashboardExpenseBreakdownChart
          data={analytics.categoryBreakdown}
          defaultCurrency={defaultCurrency}
          title={t("expenseBreakdown")}
          description={t("expenseBreakdownDescription")}
          onCategoryClick={(category) => {
            router.push(
              buildDashboardDrilldownHref({
                ...dateFilters,
                categoryCode: category.code,
                type: "expense",
              }),
            )
          }}
        />

        <div className="grid gap-6">
          <DashboardTopMerchantsChart
            data={analytics.topMerchants}
            defaultCurrency={defaultCurrency}
            title={t("topMerchants")}
            description={t("topMerchantsDescription")}
            onMerchantClick={(merchant) => {
              router.push(
                buildDashboardDrilldownHref({
                  ...dateFilters,
                  search: merchant.merchant,
                  type: "expense",
                }),
              )
            }}
          />

          <DashboardProfitTrendChart
            data={analytics.profitTrend}
            defaultCurrency={defaultCurrency}
            title={t("profitTrend")}
            description={t("profitTrendDescription")}
            onPointClick={(point) => {
              router.push(buildDashboardDrilldownHref({ period: point.period }))
            }}
          />
        </div>
      </div>
    </div>
  )
}
