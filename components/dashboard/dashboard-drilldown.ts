import { endOfMonth, format } from "date-fns"

import { filtersToSearchParams } from "@/lib/transaction-filters"
import type { TransactionFilters } from "@/models/transactions"

export type DashboardDrilldownFilters = {
  period?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  search?: string | undefined
  categoryCode?: string | undefined
  projectCode?: string | undefined
  accountId?: string | undefined
  type?: "income" | "expense" | undefined
  hasReceipts?: "missing" | "attached" | undefined
}

export function getDashboardPeriodRange(period: string) {
  // dateTo is treated as inclusive-of-that-day by the transactions model
  // (WHERE issued_at < dateTo + 1 day), so return the true last day of the
  // period here rather than the day after.
  if (period.includes("-") && period.split("-").length === 3) {
    const [year, month, day] = period.split("-").map(Number)
    if (!year || !month || !day) {
      return {
        dateFrom: period,
        dateTo: period,
      }
    }

    const date = new Date(year, month - 1, day)
    const ymd = format(date, "yyyy-MM-dd")
    return { dateFrom: ymd, dateTo: ymd }
  }

  const [year, month] = period.split("-")
  if (!year || !month) {
    return {
      dateFrom: period,
      dateTo: period,
    }
  }

  const monthDate = new Date(Number(year), Number(month) - 1, 1)
  return {
    dateFrom: format(monthDate, "yyyy-MM-dd"),
    dateTo: format(endOfMonth(monthDate), "yyyy-MM-dd"),
  }
}

export function buildDashboardDrilldownFilters(filters: DashboardDrilldownFilters): TransactionFilters {
  // When a specific period is supplied (a click on a chart point), it is the
  // more precise intent and MUST win over the dashboard's broader date range.
  const dateRange = filters.period ? getDashboardPeriodRange(filters.period) : undefined
  return {
    search: filters.search ?? "",
    dateFrom: dateRange?.dateFrom ?? filters.dateFrom ?? "",
    dateTo: dateRange?.dateTo ?? filters.dateTo ?? "",
    categoryCode: filters.categoryCode ?? "",
    projectCode: filters.projectCode ?? "",
    accountId: filters.accountId ?? "",
    type: filters.type ?? "",
    hasReceipts: filters.hasReceipts ?? "",
  }
}

export function buildDashboardDrilldownSearchParams(
  filters: DashboardDrilldownFilters,
  currentSearchParams?: URLSearchParams,
) {
  return filtersToSearchParams(buildDashboardDrilldownFilters(filters), currentSearchParams)
}

export function buildDashboardDrilldownHref(
  filters: DashboardDrilldownFilters,
  currentSearchParams?: URLSearchParams,
) {
  const searchParams = buildDashboardDrilldownSearchParams(filters, currentSearchParams)
  return searchParams.toString() ? `/transactions?${searchParams}` : "/transactions"
}
