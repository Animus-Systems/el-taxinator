import { TransactionFilters } from "@/models/transactions"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@/lib/navigation"
import { useEffect, useState } from "react"
import {
  filtersToSearchParams,
  searchParamsToFilters,
} from "@/lib/transaction-filters"

export { filtersToSearchParams, isFiltered, searchParamsToFilters } from "@/lib/transaction-filters"

export function useTransactionFilters(defaultFilters?: TransactionFilters) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const [filters, setFilters] = useState<TransactionFilters>({
    ...defaultFilters,
    ...searchParamsToFilters(searchParams),
  })

  useEffect(() => {
    const newSearchParams = filtersToSearchParams(filters, searchParams)
    const nextSearch = newSearchParams.toString()
    if (nextSearch === searchKey) return
    const href = nextSearch ? `${pathname}?${nextSearch}` : pathname
    router.replace(href)
  }, [filters, pathname, router, searchKey, searchParams])

  useEffect(() => {
    setFilters({
      ...defaultFilters,
      ...searchParamsToFilters(searchParams),
    })
  }, [defaultFilters, searchKey, searchParams])

  return [filters, setFilters] as const
}
