
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
import { AlertTriangle, ArrowDownIcon, ArrowLeftRight, ArrowUpIcon, File, HelpCircle, Paperclip, Repeat, RotateCcw, Sparkles, TrendingDown, TrendingUp, Zap } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { trpc } from "~/trpc"
import { toast } from "sonner"
import { AttachReceiptDialog } from "@/components/transactions/attach-receipt-dialog"
import { EditTransactionDialog } from "@/components/transactions/edit-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

// Returns the text color class for a transaction total. Three transfer states:
//   - paired (transfer_id set) → sky
//   - counterparty known, not yet paired (counter_account_id set, transfer_id null) → muted sky
//   - truly unknown (neither set) → amber + warning
function totalColorClass(transaction: Transaction): string {
  if (transaction.type === "transfer") {
    if (transaction.transferId !== null) return "text-sky-600"
    if (transaction.counterAccountId !== null) return "text-sky-600/60"
    return "text-amber-600"
  }
  if (transaction.type === "exchange") return "text-purple-600"
  if (transaction.type === "income") return "text-green-500"
  if (transaction.type === "expense") return "text-red-500"
  if (transaction.type === "refund") return "text-amber-600"
  return "text-black"
}

/** Direction sign shown in front of the total amount.
 *   "+" — money coming into the account (income, incoming transfer, supplier
 *         refund, …). Signed historical totals also count.
 *   "−" — money leaving the account (expense, outgoing transfer, client
 *         refund). Uses a real minus sign, not a hyphen, for typographic
 *         consistency with Intl.NumberFormat.
 *   ""  — neutral or unknown direction (exchange without a direction hint,
 *         `other`, zero-value rows).
 *
 *  Preference order: explicit sign on `total` > `transfer_direction` > type. */
export function totalSignPrefix(transaction: Transaction): "+" | "−" | "" {
  const value = transaction.total ?? 0
  if (value < 0) return "−"
  if (value > 0) {
    // The stored value is positive — derive the sign from the type and,
    // where applicable, the transfer direction. Exchange legs and `other`
    // rows have no intrinsic direction so we leave them neutral.
    if (transaction.type === "income") return "+"
    if (transaction.type === "expense") return "−"
    if (transaction.type === "refund") return "+"
    if (transaction.type === "transfer") {
      if (transaction.transferDirection === "outgoing") return "−"
      if (transaction.transferDirection === "incoming") return "+"
      return ""
    }
  }
  return ""
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

/** Pure-presentation icon used by both the inline cell and the dropdown menu
 *  items — keeps the icon/colour mapping in one place. */
function TypeIcon({
  transaction,
  label,
}: {
  transaction: Transaction
  label: string
}) {
  if (transaction.type === "transfer") {
    const isPaired = transaction.transferId !== null
    const awaitingMatch = !isPaired && transaction.counterAccountId !== null
    const colorClass = isPaired
      ? "text-sky-600"
      : awaitingMatch
        ? "text-sky-600/60"
        : "text-amber-600"
    return (
      <span
        title={label}
        aria-label={label}
        className={cn("inline-flex items-center gap-0.5", colorClass)}
      >
        {!isPaired && !awaitingMatch && <AlertTriangle className="h-3 w-3" />}
        <ArrowLeftRight className="h-4 w-4" />
      </span>
    )
  }
  if (transaction.type === "exchange") {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex items-center gap-0.5 text-purple-600"
      >
        <Repeat className="h-4 w-4" />
      </span>
    )
  }
  if (transaction.type === "refund") {
    return (
      <span title={label} aria-label={label} className="inline-flex text-amber-600">
        <RotateCcw className="h-4 w-4" />
      </span>
    )
  }
  if (transaction.type === "income") {
    return (
      <span title={label} aria-label={label} className="inline-flex text-green-500">
        <TrendingUp className="h-4 w-4" />
      </span>
    )
  }
  if (transaction.type === "expense") {
    return (
      <span title={label} aria-label={label} className="inline-flex text-red-500">
        <TrendingDown className="h-4 w-4" />
      </span>
    )
  }
  if (transaction.type === "other") {
    return (
      <span title={label} aria-label={label} className="inline-flex text-muted-foreground">
        <HelpCircle className="h-4 w-4" />
      </span>
    )
  }
  return (
    <span title={label} aria-label={label} className="inline-flex text-muted-foreground">
      <HelpCircle className="h-4 w-4" />
    </span>
  )
}

const TYPE_OPTIONS = [
  { key: "income", Icon: TrendingUp, color: "text-green-500" },
  { key: "expense", Icon: TrendingDown, color: "text-red-500" },
  { key: "refund", Icon: RotateCcw, color: "text-amber-600" },
  { key: "transfer", Icon: ArrowLeftRight, color: "text-sky-600" },
  { key: "exchange", Icon: Repeat, color: "text-purple-600" },
  { key: "other", Icon: HelpCircle, color: "text-muted-foreground" },
] as const

function TypeCell({ transaction }: { transaction: Transaction }) {
  const t = useTranslations("transactions.types")
  const tTransfers = useTranslations("transactions.transfers")
  const utils = trpc.useUtils()

  const setType = trpc.transactions.bulkSetType.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ id: transaction.id })
    },
    onError: (err) => toast.error(err.message),
  })

  // Pick the tooltip label. Transfers keep their rich "paired / awaiting /
  // unmatched" wording; everything else just uses the type name.
  let triggerLabel: string
  if (transaction.type === "transfer") {
    const isPaired = transaction.transferId !== null
    const awaitingMatch = !isPaired && transaction.counterAccountId !== null
    const direction = transaction.transferDirection
    triggerLabel = isPaired
      ? direction
        ? tTransfers(`pairedBadge.${direction}`)
        : tTransfers("pairedBadgeGeneric")
      : awaitingMatch
        ? tTransfers("awaitingMatchBadge")
        : tTransfers("unmatchedBadge")
  } else if (transaction.type === "exchange") {
    triggerLabel = tTransfers("conversionBadge")
  } else if (transaction.type) {
    triggerLabel = t(transaction.type, { defaultValue: transaction.type })
  } else {
    triggerLabel = t("other")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded p-0.5 hover:bg-muted/50"
        aria-label={triggerLabel}
      >
        <TypeIcon transaction={transaction} label={triggerLabel} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-40">
        {TYPE_OPTIONS.map(({ key, Icon, color }) => {
          const isCurrent = transaction.type === key
          return (
            <DropdownMenuItem
              key={key}
              disabled={setType.isPending || isCurrent}
              onClick={() => setType.mutate({ ids: [transaction.id], type: key })}
              className={cn("gap-2", isCurrent && "bg-muted")}
            >
              <Icon className={cn("h-4 w-4", color)} />
              <span>{t(key, { defaultValue: key })}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
            totalColorClass(transaction),
            "flex flex-col justify-end"
          )}
        >
          <span>
            {transaction.total && transaction.currencyCode ? (
              <>
                {totalSignPrefix(transaction)}
                {formatCurrency(Math.abs(transaction.total), transaction.currencyCode)}
              </>
            ) : (
              transaction.total
            )}
          </span>
          {transaction.convertedTotal &&
            transaction.convertedCurrencyCode &&
            transaction.convertedCurrencyCode !== transaction.currencyCode && (
              <span className="text-sm -mt-1">
                ({totalSignPrefix(transaction)}
                {formatCurrency(
                  Math.abs(transaction.convertedTotal),
                  transaction.convertedCurrencyCode,
                )})
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
          totalColorClass(transaction),
          "flex flex-col justify-end text-right text-lg"
        )}
      >
        {transaction.convertedTotal && transaction.convertedCurrencyCode ? (
          <>
            {totalSignPrefix(transaction)}
            {formatCurrency(
              Math.abs(transaction.convertedTotal),
              transaction.convertedCurrencyCode,
            )}
          </>
        ) : (
          transaction.convertedTotal
        )}
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

  const selectedAccountId = searchParams.get("accountId") || null
  const isRealAccount = selectedAccountId !== null && selectedAccountId !== "none"
  const selectedAccount = isRealAccount
    ? accounts.find((a) => a.id === selectedAccountId) ?? null
    : null

  const { data: balancesData } = trpc.transactions.accountBalances.useQuery({})
  const balancesByAccount = balancesData?.byAccount ?? {}
  const unassignedBalance = balancesData?.unassigned ?? { balanceCents: 0, count: 0 }

  const txIds = useMemo(() => transactions.map((t) => t.id), [transactions])
  const { data: runningBalances = {} } = trpc.transactions.runningBalances.useQuery(
    { accountId: selectedAccount?.id ?? "", transactionIds: txIds },
    { enabled: isRealAccount && !!selectedAccount && txIds.length > 0 },
  )
  const showRunningBalance = isRealAccount && Object.keys(runningBalances).length > 0

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
    <div className="space-y-3">
      <AccountBalanceChips
        accounts={accounts}
        balances={balancesByAccount}
        unassigned={unassignedBalance}
        selectedAccountId={selectedAccountId}
      />
      {selectedAccountId === "none" && unassignedBalance.count > 0 ? (
        <UnassignedBulkReassign
          accounts={accounts}
          count={unassignedBalance.count}
        />
      ) : null}
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
            {showRunningBalance ? (
              <TableHead className="text-right min-w-[110px]">Balance</TableHead>
            ) : null}
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
              {showRunningBalance ? (
                <RunningBalanceCell
                  balanceCents={runningBalances[transaction.id]}
                  currencyCode={selectedAccount?.currencyCode ?? transaction.currencyCode ?? "EUR"}
                />
              ) : null}
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
            {showRunningBalance ? <TableCell /> : null}
          </TableRow>
        </TableFooter>
      </Table>
      </div>
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

function AccountBalanceChips({
  accounts,
  balances,
  unassigned,
  selectedAccountId,
}: {
  accounts: BankAccount[]
  balances: Record<string, number>
  unassigned: { balanceCents: number; count: number }
  selectedAccountId: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  if (accounts.length === 0 && unassigned.count === 0) return null

  const go = (accountId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (accountId) {
      params.set("accountId", accountId)
    } else {
      params.delete("accountId")
    }
    const next = params.toString()
    router.replace(next ? `/transactions?${next}` : "/transactions")
  }

  const unassignedActive = selectedAccountId === "none"

  return (
    <div className="flex flex-wrap items-center gap-2">
      {accounts.map((account) => {
        const cents = balances[account.id] ?? 0
        const active = selectedAccountId === account.id
        const prefix = cents > 0 ? "+" : cents < 0 ? "−" : ""
        const amountClass =
          cents > 0
            ? "text-emerald-700 dark:text-emerald-400"
            : cents < 0
              ? "text-rose-700 dark:text-rose-400"
              : "text-muted-foreground"
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => go(active ? null : account.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-muted",
            )}
            title={account.bankName ? `${account.name} · ${account.bankName}` : account.name}
          >
            <span className="font-medium tracking-tight truncate max-w-[160px]">
              {account.name}
            </span>
            <span className={cn("tabular-nums", active ? "text-background/80" : amountClass)}>
              {prefix}
              {formatCurrency(Math.abs(cents), account.currencyCode)}
            </span>
          </button>
        )
      })}
      {unassigned.count > 0 ? (
        <button
          type="button"
          onClick={() => go(unassignedActive ? null : "none")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1 text-xs transition-colors",
            unassignedActive
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-amber-400 text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30",
          )}
          title="Transactions with no account — probably imported without a bank selected"
        >
          <span className="font-medium tracking-tight">Unassigned</span>
          <span className="tabular-nums opacity-80">{unassigned.count}</span>
        </button>
      ) : null}
    </div>
  )
}

function UnassignedBulkReassign({
  accounts,
  count,
}: {
  accounts: BankAccount[]
  count: number
}) {
  const confirm = useConfirm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const [pickedId, setPickedId] = useState<string | null>(null)

  const mutation = trpc.transactions.assignAllUnassignedToAccount.useMutation({
    onSuccess: ({ updated }) => {
      utils.transactions.list.invalidate()
      utils.transactions.accountBalances.invalidate()
      toast.success(`Moved ${updated} transaction${updated === 1 ? "" : "s"}.`)
      // After the move there's nothing left under "Unassigned" — drop the
      // filter so the user sees the destination account in context.
      const params = new URLSearchParams(searchParams.toString())
      params.delete("accountId")
      const next = params.toString()
      router.replace(next ? `/transactions?${next}` : "/transactions")
    },
    onError: (err) => toast.error(err.message),
  })

  const onConfirm = async () => {
    if (!pickedId) return
    const picked = accounts.find((a) => a.id === pickedId)
    if (!picked) return
    const ok = await confirm({
      title: `Move ${count} transaction${count === 1 ? "" : "s"} to ${picked.name}?`,
      description:
        "Every transaction without an account will be reassigned. You can still edit individual rows afterwards.",
      confirmLabel: "Move all",
    })
    if (!ok) return
    mutation.mutate({ accountId: pickedId })
  }

  if (accounts.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
      <span className="text-amber-900 dark:text-amber-200">
        {count} transaction{count === 1 ? "" : "s"} with no account. Move all to:
      </span>
      <Select value={pickedId ?? ""} onValueChange={(v) => setPickedId(v)}>
        <SelectTrigger className="h-8 w-[220px] bg-background">
          <SelectValue placeholder="Pick an account…" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
              {a.bankName ? ` · ${a.bankName}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        onClick={onConfirm}
        disabled={!pickedId || mutation.isPending}
      >
        {mutation.isPending ? "Moving…" : "Move all"}
      </Button>
    </div>
  )
}

function RunningBalanceCell({
  balanceCents,
  currencyCode,
}: {
  balanceCents: number | undefined
  currencyCode: string
}) {
  if (balanceCents === undefined) {
    return <TableCell className="text-right text-muted-foreground/50 tabular-nums">—</TableCell>
  }
  const className =
    balanceCents > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : balanceCents < 0
        ? "text-rose-700 dark:text-rose-400"
        : "text-muted-foreground"
  const prefix = balanceCents > 0 ? "+" : balanceCents < 0 ? "−" : ""
  return (
    <TableCell className={cn("text-right tabular-nums", className)}>
      {prefix}
      {formatCurrency(Math.abs(balanceCents), currencyCode)}
    </TableCell>
  )
}
