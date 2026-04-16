
import { DateRangePicker } from "@/components/forms/date-range-picker"
import { ColumnSelector } from "@/components/transactions/fields-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isFiltered } from "@/hooks/use-transaction-filters"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/lib/navigation"
import type { TransactionFilters } from "@/models/transactions"
import type { BankAccount, Category, Field, Project } from "@/lib/db-types"
import { format } from "date-fns"
import { X } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"
import { applyTransactionFilterPatch, filtersToSearchParams, searchParamsToFilters } from "@/lib/transaction-filters"

export function TransactionSearchAndFilters({
  categories,
  projects,
  fields,
  accounts = [],
}: {
  categories: Category[]
  projects: Project[]
  fields: Field[]
  accounts?: BankAccount[]
}) {
  const t = useTranslations("transactions")
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = searchParamsToFilters(searchParams)

  const handleFilterChange = (
    name: keyof TransactionFilters,
    value: TransactionFilters[keyof TransactionFilters],
  ) => {
    const nextSearch = applyTransactionFilterPatch(searchParams, {
      [name]: value ?? "",
    })
    const href = nextSearch.toString() ? `/transactions?${nextSearch}` : "/transactions"
    router.replace(href)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            key={`search-${filters.search || ""}`}
            placeholder="Search transactions..."
            defaultValue={filters.search}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleFilterChange("search", (e.target as HTMLInputElement).value)
              }
            }}
            className="w-full"
          />
        </div>

        <Select value={filters.categoryCode || "-"} onValueChange={(value) => handleFilterChange("categoryCode", value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.code} value={category.code}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                  {getLocalizedValue(category.name, locale)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {accounts.length > 0 && (
          <Select value={filters.accountId || "-"} onValueChange={(value) => handleFilterChange("accountId", value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("allAccounts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-">{t("allAccounts")}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.hasReceipts || "-"}
          onValueChange={(value) =>
            handleFilterChange(
              "hasReceipts",
              value === "-" ? "" : (value as "missing" | "attached"),
            )
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("receipts.filterAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-">{t("receipts.filterAll")}</SelectItem>
            <SelectItem value="missing">{t("receipts.filterMissing")}</SelectItem>
            <SelectItem value="attached">{t("receipts.filterAttached")}</SelectItem>
          </SelectContent>
        </Select>

        {projects.length > 1 && (
          <Select value={filters.projectCode || "-"} onValueChange={(value) => handleFilterChange("projectCode", value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.code} value={project.code}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                    {getLocalizedValue(project.name, locale)}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DateRangePicker
          defaultDate={{
            from: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            to: filters.dateTo ? new Date(filters.dateTo) : undefined,
          }}
          onChange={(date) => {
            handleFilterChange("dateFrom", date?.from ? format(date.from, "yyyy-MM-dd") : "")
            handleFilterChange("dateTo", date?.to ? format(date.to, "yyyy-MM-dd") : "")
          }}
        />

        {isFiltered(filters) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const nextSearch = filtersToSearchParams({}, searchParams)
              const href = nextSearch.toString() ? `/transactions?${nextSearch}` : "/transactions"
              router.replace(href)
            }}
            className="text-muted-foreground hover:text-foreground"
            title={t("clearFilters")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <ColumnSelector fields={fields} />
      </div>
    </div>
  )
}
