import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dashboardTranslations: Record<string, string> = {
  title: "Dashboard",
  controlRoomSubtitle: "Cash flow, spend mix, and vendor trends at a glance",
  totalIncome: "Total Income",
  totalExpenses: "Total Expenses",
  netProfit: "Net Profit",
  processedTransactions: "Processed Transactions",
  cashFlowOverTime: "Cash flow over time",
  cashFlowDescription: "Income, expenses, and net cash flow in the selected range.",
  expenseBreakdown: "Expense breakdown",
  expenseBreakdownDescription: "Where spend is concentrated across categories.",
  topMerchants: "Top merchants",
  topMerchantsDescription: "Largest spend vendors by transaction volume.",
  profitTrend: "Profit trend",
  profitTrendDescription: "The direction of business profit over time.",
  emptyAnalyticsTitle: "No analytics yet",
  emptyAnalyticsDescription: "Once transactions are categorized, charts will appear here.",
  errorTitle: "Dashboard unavailable",
  errorDescription: "Analytics could not be loaded right now. Try again in a moment.",
  loading: "Loading…",
}

const mocks = vi.hoisted(() => ({
  settingsUseQuery: vi.fn(),
  dashboardUseQuery: vi.fn(),
  analyticsUseQuery: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => dashboardTranslations[key] ?? key,
  }),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock("~/trpc", () => ({
  trpc: {
    settings: {
      get: {
        useQuery: mocks.settingsUseQuery,
      },
    },
    stats: {
      dashboard: {
        useQuery: mocks.dashboardUseQuery,
      },
      analytics: {
        useQuery: mocks.analyticsUseQuery,
      },
    },
  },
}))

import { DashboardPage } from "@/src/routes/_app/dashboard"

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.settingsUseQuery.mockReturnValue({
      data: { default_currency: "EUR" },
      isLoading: false,
      error: null,
    })
    mocks.dashboardUseQuery.mockReturnValue({
      data: {
        totalIncomePerCurrency: { EUR: 1200 },
        totalExpensesPerCurrency: { EUR: 450 },
        profitPerCurrency: { EUR: 750 },
        invoicesProcessed: 18,
      },
      isLoading: false,
      error: null,
    })
    mocks.analyticsUseQuery.mockReturnValue({
      data: {
        timeSeries: [],
        categoryBreakdown: [],
        topMerchants: [],
        profitTrend: [],
        otherCurrencies: [],
      },
      isLoading: false,
      error: null,
    })
  })

  it("removes upload widgets and renders analytics-first panels", () => {
    const html = renderToStaticMarkup(createElement(DashboardPage))

    expect(html).not.toContain("Take a photo or drop your files here")
    expect(html).not.toContain("No unsorted files")
    expect(html).toContain("Cash flow over time")
    expect(html).toContain("Expense breakdown")
    expect(html).toContain("Top merchants")
    expect(html).toContain("Profit trend")
    expect(html).toContain("Total Income")
    expect(html).toContain("Processed Transactions")
  })

  it("renders an error panel instead of the empty analytics state when queries fail", () => {
    mocks.analyticsUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    })

    const html = renderToStaticMarkup(createElement(DashboardPage))

    expect(html).toContain("Dashboard unavailable")
    expect(html).toContain("Analytics could not be loaded right now. Try again in a moment.")
    expect(html).not.toContain("No analytics yet")
  })
})
