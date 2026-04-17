
import { BulkActionsMenu } from "@/components/transactions/bulk-actions"
import { ReanalyzeDialog } from "@/components/transactions/reanalyze-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcNetTotalPerCurrency, calcTotalPerCurrency, isTransactionIncomplete } from "@/lib/stats"
import { getVisibleTransactionFields } from "@/lib/transaction-list-fields"
import { cn, formatCurrency } from "@/lib/utils"
import type { BankAccount, Category, Field, Project, Transaction } from "@/lib/db-types"
import { formatDate } from "date-fns"
import { AlertTriangle, ArrowDownIcon, ArrowLeftRight, ArrowUpIcon, File, Paperclip, Sparkles, TrendingDown, TrendingUp, Zap } from "lucide-react"
import { AttachReceiptDialog } from "@/components/transactions/attach-receipt-dialog"
import { EditTransactionDialog } from "@/components/transactions/edit-dialog"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/lib/navigation"
import { useEffect, useMemo, useState } from "react"
import { L } from "@/components/ui/localized-text"
import { getLocalizedValue } from "@/lib/i18n-db"
import { useLocale } from "next-intl"

type FieldRendererContext = {
  accountById: Map<string, { name: string }>
}

type FieldRenderer = {
  name: string
  code: string
  classes?: string
  sortable: boolean
  formatValue?: (transaction: TransactionWithRelations, ctx: FieldRendererContext) => React.ReactNode
  footerValue?: (transactions: Transaction[]) => React.ReactNode
}

type FieldWithRenderer = Field & {
  renderer: FieldRenderer
}

type TransactionWithRelations = Transaction & {
  category?: Category | null
  project?: Project | null
}

function FilesCell({ transaction }: { transaction: Transaction }) {
  const t = useTranslations("transactions")
  const [open, setOpen] = useState(false)
  const count = (transaction.files as string[]).length
  const missing =
    transaction.type === "expense" &&
    transaction.status === "business" &&
    count === 0

  return (
    <div
      className="flex items-center gap-2 text-sm"
      onClick={(event) => event.stopPropagation()}
    >
      <File className="w-4 h-4" />
      <span>{count}</span>
      {missing && (
        <Badge
          variant="outline"
          className="border-amber-300 text-amber-700 gap-1"
        >
          <AlertTriangle className="h-3 w-3" />
          <span className="whitespace-nowrap">{t("receipts.missingReceipt")}</span>
        </Badge>
      )}
      {transaction.type === "expense" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title={t("receipts.attach")}
          onClick={() => setOpen(true)}
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>
      )}
      <AttachReceiptDialog
        open={open}
        onOpenChange={setOpen}
        transactionId={transaction.id}
      />
    </div>
  )
}

function TypeCell({ transaction }: { transaction: Transaction }) {
  const t = useTranslations("transactions.types")
  const tTransfers = useTranslations("transactions.transfers")

  if (transaction.type === "transfer") {
    const isOrphan = !transaction.transferId
    const direction = transaction.transferDirection
    const label = isOrphan
      ? tTransfers("unmatchedBadge")
      : direction
        ? tTransfers(`pairedBadge.${direction}`)
        : tTransfers("pairedBadgeGeneric")
    return (
      <span
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-0.5",
          isOrphan ? "text-amber-600" : "text-sky-600",
        )}
      >
        {isOrphan && <AlertTriangle className="h-3 w-3" />}
        <ArrowLeftRight className="h-4 w-4" />
      </span>
    )
  }

  const type: "income" | "expense" | "other" =
    transaction.type === "income" || transaction.type === "expense" ? transaction.type : "other"
  const label = t(type)

  const Icon = type === "income" ? TrendingUp : type === "expense" ? TrendingDown : ArrowLeftRight
  const color =
    type === "income" ? "text-green-500" : type === "expense" ? "text-red-500" : "text-muted-foreground"

  return (
    <span title={label} aria-label={label} className="inline-flex">
      <Icon className={cn("h-4 w-4", color)} />
    </span>
  )
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
    formatValue: (transaction: TransactionWithRelations) => (
      <div className="flex items-center gap-1.5">
        {transaction.categoryCode ? (
          <Badge className="whitespace-nowrap" style={{ backgroundColor: transaction.category?.color }}>
            <L>{transaction.category?.name}</L>
          </Badge>
        ) : (
          "-"
        )}
        {transaction.appliedRuleId ? (
          <a
            href={`/settings/rules/${transaction.appliedRuleId}`}
            onClick={(e) => e.stopPropagation()}
            title="Categorized by rule — click to view"
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
          >
            <Zap className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    ),
  },
  accountName: {
    name: "Account",
    code: "accountName",
    classes: "min-w-[120px] max-w-[200px] overflow-hidden",
    sortable: true,
    formatValue: (transaction: TransactionWithRelations, ctx: FieldRendererContext) => {
      const accountName = (transaction as Record<string, unknown>)["accountName"] as string | null
      const accountBankName = (transaction as Record<string, unknown>)["accountBankName"] as string | null
      const titleAttr = accountBankName && accountName ? `${accountName} (${accountBankName})` : undefined

      const counterAccountId = transaction.counterAccountId
      const counterName =
        transaction.type === "transfer" && counterAccountId
          ? ctx.accountById.get(counterAccountId)?.name ?? null
          : null
      const direction = transaction.transferDirection

      if (!accountName && !counterName) {
        return <span className="text-muted-foreground">-</span>
      }

      return (
        <div className="flex flex-col">
          <span title={titleAttr}>{accountName ?? "-"}</span>
          {counterName && (
            <span className="text-xs text-muted-foreground">
              {direction === "outgoing" ? "→" : direction === "incoming" ? "←" : "↔"} {counterName}
            </span>
          )}
        </div>
      )
    },
  },
  files: {
    name: "Files",
    code: "files",
    sortable: false,
    formatValue: (transaction: Transaction) => <FilesCell transaction={transaction} />,
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
            { income: "text-green-500", expense: "text-red-500", transfer: "text-sky-600", other: "text-black" }[transaction.type || "other"],
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
          { income: "text-green-500", expense: "text-red-500", transfer: "text-sky-600", other: "text-black" }[transaction.type || "other"],
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
  type: {
    name: "Type",
    code: "type",
    classes: "w-10 text-center",
    sortable: true,
    formatValue: (transaction: Transaction) => <TypeCell transaction={transaction} />,
  },
}

const getFieldRenderer = (field: Field): FieldRenderer => {
  const existing = standardFieldRenderers[field.code as keyof typeof standardFieldRenderers]
  if (existing) {
    return existing
  }
  return {
    name: getLocalizedValue(field.name, "en"),
    code: field.code,
    classes: "",
    sortable: false,
  }
}

export function TransactionList({
  transactions,
  fields = [],
  accounts = [],
}: {
  transactions: TransactionWithRelations[]
  fields?: Field[]
  accounts?: BankAccount[]
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const router = useRouter()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()

  const accountById = useMemo(() => {
    const map = new Map<string, { name: string }>()
    for (const account of accounts) {
      map.set(account.id, { name: account.name })
    }
    return map
  }, [accounts])

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
      getVisibleTransactionFields(fields)
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

  const editingId = searchParams.get("tx")

  const handleRowClick = (id: string) => {
    const params = new URLSearchParams(searchKey)
    params.set("tx", id)
    router.push(`/transactions?${params.toString()}`)
  }

  const handleCloseDialog = () => {
    const params = new URLSearchParams(searchKey)
    params.delete("tx")
    const next = params.toString()
    router.replace(next ? `/transactions?${next}` : "/transactions")
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
      return field.renderer.formatValue(transaction, { accountById })
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
          <BulkActionsMenu
            selectedIds={selectedIds}
            selectedTransactions={transactions.filter((tx) => selectedIds.includes(tx.id))}
            onActionComplete={() => setSelectedIds([])}
          />
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
      {editingId && (
        <EditTransactionDialog transactionId={editingId} onClose={handleCloseDialog} />
      )}
    </div>
  )
}
