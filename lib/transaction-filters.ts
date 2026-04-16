import type { TransactionFilters } from "@/models/transactions"
import { format } from "date-fns"

const filterKeys = ["search", "dateFrom", "dateTo", "ordering", "categoryCode", "projectCode", "accountId", "type", "hasReceipts"]

export function searchParamsToFilters(searchParams: URLSearchParams) {
  return filterKeys.reduce((acc, filter) => {
    acc[filter] = searchParams.get(filter) || ""
    return acc
  }, {} as Record<string, string>) as TransactionFilters
}

export function filtersToSearchParams(
  filters: TransactionFilters,
  currentSearchParams?: URLSearchParams,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (currentSearchParams) {
    currentSearchParams.forEach((value, key) => {
      if (!filterKeys.includes(key)) {
        searchParams.set(key, value)
      }
    })
  }

  if (filters.search) {
    searchParams.set("search", filters.search)
  } else {
    searchParams.delete("search")
  }

  if (filters.dateFrom) {
    searchParams.set("dateFrom", format(new Date(filters.dateFrom), "yyyy-MM-dd"))
  } else {
    searchParams.delete("dateFrom")
  }

  if (filters.dateTo) {
    searchParams.set("dateTo", format(new Date(filters.dateTo), "yyyy-MM-dd"))
  } else {
    searchParams.delete("dateTo")
  }

  if (filters.ordering) {
    searchParams.set("ordering", filters.ordering)
  } else {
    searchParams.delete("ordering")
  }

  if (filters.categoryCode && filters.categoryCode !== "-") {
    searchParams.set("categoryCode", filters.categoryCode)
  } else {
    searchParams.delete("categoryCode")
  }

  if (filters.projectCode && filters.projectCode !== "-") {
    searchParams.set("projectCode", filters.projectCode)
  } else {
    searchParams.delete("projectCode")
  }

  if (filters.accountId && filters.accountId !== "-") {
    searchParams.set("accountId", filters.accountId)
  } else {
    searchParams.delete("accountId")
  }

  if (filters.type && filters.type !== "-") {
    searchParams.set("type", filters.type)
  } else {
    searchParams.delete("type")
  }

  if (filters.hasReceipts) {
    searchParams.set("hasReceipts", filters.hasReceipts)
  } else {
    searchParams.delete("hasReceipts")
  }

  return searchParams
}

export function applyTransactionFilterPatch(
  currentSearchParams: URLSearchParams,
  patch: Partial<TransactionFilters>,
): URLSearchParams {
  const currentFilters = searchParamsToFilters(currentSearchParams)
  return filtersToSearchParams(
    {
      ...currentFilters,
      ...patch,
    },
    currentSearchParams,
  )
}

export function isFiltered(filters: TransactionFilters) {
  return Object.values(filters).some((value) => value !== "" && value !== "-")
}
