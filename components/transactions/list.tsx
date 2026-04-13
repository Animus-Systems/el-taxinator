
import { BulkActionsMenu } from "@/components/transactions/bulk-actions"
import { ReanalyzeDialog } from "@/components/transactions/reanalyze-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcNetTotalPerCurrency, calcTotalPerCurrency, isTransactionIncomplete } from "@/lib/stats"
import { cn, formatCurrency } from "@/lib/utils"
import type { Category, Field, Project, Transaction } from "@/lib/db-types"
import { formatDate } from "date-fns"
import { ArrowDownIcon, ArrowUpIcon, File, Sparkles } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/lib/navigation"
import { useEffect, useMemo, useState } from "react"
import { L } from "@/components/ui/localized-text"
import { getLocalizedValue } from "@/lib/i18n-db"
import { useLocale } from "next-intl"

type FieldRenderer = {
  name: string
  code: string
  classes?: string
  sortable: boolean
  formatValue?: (transaction: TransactionWithRelations) => React.ReactNode
  footerValue?: (transactions: Transaction[]) => React.ReactNode
}

type FieldWithRenderer = Field & {
  renderer: FieldRenderer
}

type TransactionWithRelations = Transaction & {
  category?: Category | null
  project?: Project | null
}

export const standardFieldRenderers: Record<string, FieldRenderer> = {
  name: {
    name: "Name",
    code: "name",
    classes: "font-medium min-w-[120px] max-w-[300px] overflow-hidden",
    sortable: true,
  },
  merchant: {
    name: "Merchant",
    code: "merchant",
    classes: "min-w-[120px] max-w-[250px] overflow-hidden",
    sortable: true,
  },
  issuedAt: {
    name: "Date",
    code: "issuedAt",
    classes: "min-w-[100px]",
    sortable: true,
    formatValue: (transaction: Transaction) =>
      transaction.issuedAt ? formatDate(transaction.issuedAt, "yyyy-MM-dd") : "",
  },
  projectCode: {
    name: "Project",
    code: "projectCode",
    sortable: true,
    formatValue: (transaction: TransactionWithRelations) =>
      transaction.projectCode ? (
        <Badge className="whitespace-nowrap" style={{ backgroundColor: transaction.project?.color }}>
          <L>{transaction.project?.name}</L>
        </Badge>
      ) : (
        "-"
      ),
  },
  categoryCode: {
    name: "Category",
    code: "categoryCode",
    sortable: true,
    formatValue: (transaction: TransactionWithRelations) =>
      transaction.categoryCode ? (
        <Badge className="whitespace-nowrap" style={{ backgroundColor: transaction.category?.color }}>
          <L>{transaction.category?.name}</L>
        </Badge>
      ) : (
        "-"
      ),
  },
  accountName: {
    name: "Account",
    code: "accountName",
    classes: "min-w-[120px] max-w-[200px] overflow-hidden",
    sortable: true,
    formatValue: (transaction: TransactionWithRelations) => {
      const accountName = (transaction as Record<string, unknown>).accountName as string | null
      const accountBankName = (transaction as Record<string, unknown>).accountBankName as string | null
      if (!accountName) return <span className="text-muted-foreground">-</span>
      const titleAttr = accountBankName ? `${accountName} (${accountBankName})` : undefined
      return <span title={titleAttr}>{accountName}</span>
    },
  },
  files: {
    name: "Files",
    code: "files",
    sortable: false,
    formatValue: (transaction: Transaction) => (
      <div className="flex items-center gap-2 text-sm">
        <File className="w-4 h-4" />
        {(transaction.files as string[]).length}
      </div>
    ),
  },
  total: {
    name: "Total",
    code: "total",
    classes: "text-right",
    sortable: true,
    formatValue: (transaction: Transaction) => (
      <div className="text-right text-lg">
        <div
          className={cn(
            { income: "text-green-500", expense: "text-red-500", other: "text-black" }[transaction.type || "other"],
            "flex flex-col justify-end"
          )}
        >
          <span>
            {transaction.total && transaction.currencyCode
              ? formatCurrency(transaction.total, transaction.currencyCode)
              : transaction.total}
          </span>
          {transaction.convertedTotal &&
            transaction.convertedCurrencyCode &&
            transaction.convertedCurrencyCode !== transaction.currencyCode && (
              <span className="text-sm -mt-1">
                ({formatCurrency(transaction.convertedTotal, transaction.convertedCurrencyCode)})
              </span>
            )}
        </div>
      </div>
    ),
    footerValue: (transactions: Transaction[]) => {
      const netTotalPerCurrency = calcNetTotalPerCurrency(transactions)
      const turnoverPerCurrency = calcTotalPerCurrency(transactions)

      return (
        <div className="flex flex-col gap-3 text-right">
          <dl className="space-y-1">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Net Total</dt>
            {Object.entries(netTotalPerCurrency).map(([currency, total]) => (
              <dd
                key={`net-${currency}`}
                className={cn("text-sm first:text-base font-medium", total >= 0 ? "text-green-600" : "text-red-600")}
              >
                {formatCurrency(total, currency)}
              </dd>
            ))}
          </dl>
          <dl className="space-y-1">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Turnover</dt>
            {Object.entries(turnoverPerCurrency).map(([currency, total]) => (
              <dd key={`turnover-${currency}`} className="text-sm text-muted-foreground">
                {formatCurrency(total, currency)}
              </dd>
            ))}
          </dl>
        </div>
      )
    },
  },
  convertedTotal: {
    name: "Converted Total",
    code: "convertedTotal",
    classes: "text-right",
    sortable: true,
    formatValue: (transaction: Transaction) => (
      <div
        className={cn(
          { income: "text-green-500", expense: "text-red-500", other: "text-black" }[transaction.type || "other"],
          "flex flex-col justify-end text-right text-lg"
        )}
      >
        {transaction.convertedTotal && transaction.convertedCurrencyCode
          ? formatCurrency(transaction.convertedTotal, transaction.convertedCurrencyCode)
          : transaction.convertedTotal}
      </div>
    ),
  },
  currencyCode: {
    name: "Currency",
    code: "currencyCode",
    classes: "text-right",
    sortable: true,
  },
}

const getFieldRenderer = (field: Field): FieldRenderer => {
  if (standardFieldRenderers[field.code as keyof typeof standardFieldRenderers]) {
    return standardFieldRenderers[field.code as keyof typeof standardFieldRenderers]
  } else {
    return {
      name: getLocalizedValue(field.name, "en"),
      code: field.code,
      classes: "",
      sortable: false,
    }
  }
}

export function TransactionList({ transactions, fields = [] }: { transactions: TransactionWithRelations[]; fields?: Field[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const router = useRouter()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()

  const [sorting, setSorting] = useState<{ field: string | null; direction: "asc" | "desc" | null }>(() => {
    const ordering = searchParams.get("ordering")
    if (!ordering) return { field: null, direction: null }
    const isDesc = ordering.startsWith("-")
    return {
      field: isDesc ? ordering.slice(1) : ordering,
      direction: isDesc ? "desc" : "asc",
    }
  })

  const visibleFields = useMemo(
    (): FieldWithRenderer[] =>
      fields
        .filter((field) => field.isVisibleInList)
        .map((field) => ({
          ...field,
          renderer: getFieldRenderer(field),
        })),
    [fields]
  )

  const toggleAllRows = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(transactions.map((transaction) => transaction.id))
    }
  }

  const toggleOneRow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleRowClick = (id: string) => {
    router.push(`/transactions/${id}`)
  }

  const handleSort = (field: string) => {
    let newDirection: "asc" | "desc" | null = "asc"

    if (sorting.field === field) {
      if (sorting.direction === "asc") newDirection = "desc"
      else if (sorting.direction === "desc") newDirection = null
    }

    setSorting({
      field: newDirection ? field : null,
      direction: newDirection,
    })
  }

  const renderFieldInTable = (transaction: TransactionWithRelations, field: FieldWithRenderer): string | React.ReactNode => {
    if (field.isExtra) {
      return transaction.extra?.[field.code as keyof typeof transaction.extra] ?? ""
    } else if (field.renderer.formatValue) {
      return field.renderer.formatValue(transaction)
    } else {
      return String(transaction[field.code as keyof Transaction])
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(searchKey)
    if (sorting.field && sorting.direction) {
      const ordering = sorting.direction === "desc" ? `-${sorting.field}` : sorting.field
      params.set("ordering", ordering)
    } else {
      params.delete("ordering")
    }
    const nextSearch = params.toString()
    if (nextSearch === searchKey) return
    const href = nextSearch ? `/transactions?${nextSearch}` : "/transactions"
    router.replace(href)
  }, [router, searchKey, sorting])

  const getSortIcon = (field: string) => {
    if (sorting.field !== field) return null
    return sorting.direction === "asc" ? (
      <ArrowUpIcon className="w-4 h-4 ml-1 inline" />
    ) : sorting.direction === "desc" ? (
      <ArrowDownIcon className="w-4 h-4 ml-1 inline" />
    ) : null
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[30px] select-none">
              <Checkbox checked={selectedIds.length === transactions.length} onCheckedChange={toggleAllRows} />
            </TableHead>
            {visibleFields.map((field) => (
              <TableHead
                key={field.code}
                className={cn(
                  field.renderer.classes,
                  field.renderer.sortable && "hover:cursor-pointer hover:bg-accent select-none"
                )}
                onClick={() => field.renderer.sortable && handleSort(field.code)}
              >
                {getLocalizedValue(field.name, locale) || field.renderer.name}
                {field.renderer.sortable && getSortIcon(field.code)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow
              key={transaction.id}
              className={cn(
                isTransactionIncomplete(fields, transaction) && "bg-yellow-50",
                selectedIds.includes(transaction.id) && "bg-muted",
                "cursor-pointer hover:bg-muted/50"
              )}
              onClick={() => handleRowClick(transaction.id)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(transaction.id)}
                  onCheckedChange={(checked) => {
                    if (checked !== "indeterminate") {
                      toggleOneRow({ stopPropagation: () => {} } as React.MouseEvent, transaction.id)
                    }
                  }}
                />
              </TableCell>
              {visibleFields.map((field) => (
                <TableCell key={field.code} className={field.renderer.classes}>
                  {renderFieldInTable(transaction, field)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell></TableCell>
            {visibleFields.map((field) => (
              <TableCell key={field.code} className={field.renderer.classes}>
                {field.renderer.footerValue ? field.renderer.footerValue(transactions) : ""}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
      {selectedIds.length > 0 && (
        <>
          <BulkActionsMenu selectedIds={selectedIds} onActionComplete={() => setSelectedIds([])} />
          <div className="fixed bottom-4 right-56 z-50">
            <ReanalyzeDialog
              transactionIds={selectedIds}
              onComplete={() => setSelectedIds([])}
            >
              <Button variant="outline" className="min-w-48 gap-2 bg-background shadow-md">
                <Sparkles className="h-4 w-4" />
                Re-analyze {selectedIds.length} selected
              </Button>
            </ReanalyzeDialog>
          </div>
        </>
      )}
    </div>
  )
}
