import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { Link } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"

export type DrillSource =
  | {
      kind: "invoices"
      year: number
      quarter: number
      dateFrom: string
      dateTo: string
      statuses: string[]
    }
  | {
      kind: "transactions"
      dateFrom: string
      dateTo: string
      type?: string
      categoryCode?: string
    }

export type CasillaDrillSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  casilla?: string
  source: DrillSource
}

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  return format(d, "dd MMM yyyy")
}

export function CasillaDrillSheet({
  open,
  onOpenChange,
  title,
  casilla,
  source,
}: CasillaDrillSheetProps) {
  const t = useTranslations("tax")

  const invoicesQuery = trpc.invoices.list.useQuery(
    source.kind === "invoices"
      ? { dateFrom: source.dateFrom, dateTo: source.dateTo, status: source.statuses }
      : { dateFrom: "", dateTo: "", status: [] },
    { enabled: open && source.kind === "invoices" },
  )

  const transactionsQuery = trpc.transactions.list.useQuery(
    source.kind === "transactions"
      ? {
          dateFrom: source.dateFrom,
          dateTo: source.dateTo,
          limit: 500,
          ...(source.type !== undefined && { type: source.type }),
          ...(source.categoryCode !== undefined && { categoryCode: source.categoryCode }),
        }
      : { dateFrom: "", dateTo: "", limit: 500 },
    { enabled: open && source.kind === "transactions" },
  )

  const isLoading =
    (source.kind === "invoices" && invoicesQuery.isLoading) ||
    (source.kind === "transactions" && transactionsQuery.isLoading)

  const invoices = source.kind === "invoices" ? invoicesQuery.data ?? [] : []
  const transactions = source.kind === "transactions" ? transactionsQuery.data?.transactions ?? [] : []
  const count = source.kind === "invoices" ? invoices.length : transactions.length
  const hasItems = count > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {casilla ? (
              <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {casilla}
              </span>
            ) : null}
            <SheetTitle>{title}</SheetTitle>
          </div>
          <SheetDescription>
            {t("drilldown.showingInRange", {
              count,
              from: formatDate(source.dateFrom),
              to: formatDate(source.dateTo),
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasItems ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("drilldown.noItems")}
            </p>
          ) : source.kind === "invoices" ? (
            <ul className="divide-y">
              {invoices.map((inv) => {
                const { total } = calcInvoiceTotals(inv.items)
                return (
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground">
                        {formatDate(inv.issueDate)}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        {inv.number ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {inv.number}
                          </span>
                        ) : null}
                        <span className="truncate">{inv.client?.name ?? "—"}</span>
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <Badge variant="outline" className="text-xs">
                          {inv.status}
                        </Badge>
                        <span className="tabular-nums">{formatEUR(total)}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="divide-y">
              {transactions.map((tx) => {
                const amountCents = tx.convertedTotal ?? tx.total ?? 0
                const label = tx.merchant ?? tx.name ?? tx.description ?? "—"
                const isNegative = amountCents < 0
                return (
                  <li key={tx.id}>
                    <Link
                      href={`/transactions?tx=${tx.id}`}
                      className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground">
                        {formatDate(tx.issuedAt)}
                      </span>
                      <span className="truncate">{label}</span>
                      <span
                        className={cn(
                          "tabular-nums text-right",
                          isNegative ? "text-red-600 dark:text-red-400" : "",
                        )}
                      >
                        {formatEUR(amountCents)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
