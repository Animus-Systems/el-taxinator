import { addDays, format } from "date-fns"

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
  if (period.includes("-") && period.split("-").length === 3) {
    const [year, month, day] = period.split("-").map(Number)
    if (!year || !month || !day) {
      return {
        dateFrom: period,
        dateTo: period,
      }
    }

    const date = new Date(year, month - 1, day)
    return {
      dateFrom: format(date, "yyyy-MM-dd"),
      dateTo: format(addDays(date, 1), "yyyy-MM-dd"),
    }
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
    dateTo: format(new Date(Number(year), Number(month), 1), "yyyy-MM-dd"),
  }
}

export function buildDashboardDrilldownFilters(filters: DashboardDrilldownFilters): TransactionFilters {
  const dateRange = filters.period ? getDashboardPeriodRange(filters.period) : undefined
  return {
    search: filters.search ?? "",
    dateFrom: filters.dateFrom ?? dateRange?.dateFrom ?? "",
    dateTo: filters.dateTo ?? dateRange?.dateTo ?? "",
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
