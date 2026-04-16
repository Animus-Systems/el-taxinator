import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { Loader2, Sparkles } from "lucide-react"

type SuggestedMatch = {
  invoiceId: string
  transactionId: string
  amountCents: number
  confidence: number
  reasoning: string
}

export function ReconcilePage() {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.invoicePayments.reconcileData.useQuery({})
  const invoices = useMemo(() => data?.invoices ?? [], [data])
  const transactions = useMemo(() => data?.transactions ?? [], [data])

  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([])
  const [rejectedIdx, setRejectedIdx] = useState<Set<number>>(new Set())

  const aiMatch = trpc.invoicePayments.aiMatch.useMutation({
    onSuccess: (result) => {
      setSuggestions(result)
      setRejectedIdx(new Set())
    },
  })

  const createPayment = trpc.invoicePayments.create.useMutation({
    onSuccess: () => {
      utils.invoicePayments.reconcileData.invalidate()
      utils.invoices.list.invalidate()
    },
  })

  const invoicesById = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices],
  )
  const transactionsById = useMemo(
    () => new Map(transactions.map((t) => [t.id, t])),
    [transactions],
  )

  const visibleSuggestions = suggestions
    .map((s, idx) => ({ s, idx }))
    .filter(({ idx }) => !rejectedIdx.has(idx))
    .filter(({ s }) => invoicesById.has(s.invoiceId) && transactionsById.has(s.transactionId))

  const onAcceptOne = async (suggestion: SuggestedMatch, idx: number) => {
    await createPayment.mutateAsync({
      invoiceId: suggestion.invoiceId,
      transactionId: suggestion.transactionId,
      amountCents: suggestion.amountCents,
      source: "ai",
    })
    setRejectedIdx((prev) => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
  }

  const onAcceptAll = async () => {
    for (const { s, idx } of visibleSuggestions) {
      await createPayment
        .mutateAsync({
          invoiceId: s.invoiceId,
          transactionId: s.transactionId,
          amountCents: s.amountCents,
          source: "ai",
        })
        .catch(() => {})
      setRejectedIdx((prev) => {
        const next = new Set(prev)
        next.add(idx)
        return next
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("reconcile.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("reconcile.subtitle")}</p>
        </div>
        <Button
          type="button"
          onClick={() => aiMatch.mutate({})}
          disabled={aiMatch.isPending || invoices.length === 0 || transactions.length === 0}
        >
          {aiMatch.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {aiMatch.isPending ? t("reconcile.analyzing") : t("reconcile.analyzeWithAi")}
        </Button>
      </header>

      {aiMatch.error && <p className="text-sm text-destructive">{aiMatch.error.message}</p>}

      {visibleSuggestions.length > 0 && (
        <section className="space-y-3 rounded-md border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              {t("reconcile.suggestions", { count: visibleSuggestions.length })}
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAcceptAll}
              disabled={createPayment.isPending}
            >
              {t("reconcile.acceptAll")}
            </Button>
          </div>
          <ul className="space-y-2">
            {visibleSuggestions.map(({ s, idx }) => {
              const inv = invoicesById.get(s.invoiceId)!
              const tx = transactionsById.get(s.transactionId)!
              return (
                <li
                  key={idx}
                  className="flex flex-col gap-2 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{inv.number}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <span className="truncate">{tx.name || tx.merchant || tx.id.slice(0, 8)}</span>
                      <Badge
                        variant={s.confidence >= 0.7 ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {Math.round(s.confidence * 100)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap font-medium">
                      {formatCurrency(s.amountCents, tx.currencyCode ?? "EUR")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setRejectedIdx((prev) => {
                          const next = new Set(prev)
                          next.add(idx)
                          return next
                        })
                      }
                    >
                      {t("reconcile.reject")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onAcceptOne(s, idx)}
                      disabled={createPayment.isPending}
                    >
                      {t("reconcile.accept")}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("reconcile.unpaidInvoicesHeading", { count: invoices.length })}</h2>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("reconcile.loading")}</p>
          ) : invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("reconcile.noUnpaidInvoices")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {invoices.map((inv) => {
                const outstanding = inv.totalCents - inv.allocatedCents
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{inv.number}</span>
                      <span className="text-xs text-muted-foreground">
                        {inv.clientName ?? "—"} · {format(inv.issueDate, "yyyy-MM-dd")}
                      </span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="font-medium">{formatCurrency(inv.totalCents, "EUR")}</span>
                      {inv.allocatedCents > 0 && (
                        <span className="text-xs text-amber-700">
                          {t("reconcile.outstandingAmount", {
                            amount: formatCurrency(outstanding, "EUR"),
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("reconcile.unallocatedTransactionsHeading", { count: transactions.length })}</h2>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("reconcile.loading")}</p>
          ) : transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("reconcile.noUnallocatedTx")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {transactions.map((tx) => {
                const unallocated = tx.totalCents - tx.allocatedCents
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{tx.name || tx.merchant || t("reconcile.unnamed")}</span>
                      <span className="text-xs text-muted-foreground">
                        {tx.issuedAt ? format(tx.issuedAt, "yyyy-MM-dd") : "—"}
                        {tx.type ? ` · ${tx.type}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="font-medium">
                        {formatCurrency(tx.totalCents, tx.currencyCode ?? "EUR")}
                      </span>
                      {tx.allocatedCents > 0 && (
                        <span className="text-xs text-amber-700">
                          {t("reconcile.unallocatedAmount", {
                            amount: formatCurrency(unallocated, tx.currencyCode ?? "EUR"),
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
