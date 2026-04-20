import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { formatCurrency } from "@/lib/utils"

type ReconcileTx = {
  id: string
  name: string | null
  merchant: string | null
  issuedAt: Date | null
  totalCents: number
  type: string | null
  currencyCode: string | null
  allocatedCents: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  invoiceTotalCents: number
  invoiceAllocatedCents: number
  invoiceCurrency: string
  onLinked: () => void
}

export function LinkInvoiceToTransactionDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceTotalCents,
  invoiceAllocatedCents,
  invoiceCurrency,
  onLinked,
}: Props) {
  const { t } = useTranslation("invoices")

  const { data: reconcile, isLoading } = trpc.reconcile.data.useQuery(
    {},
    { enabled: open },
  )

  const outstanding = Math.max(invoiceTotalCents - invoiceAllocatedCents, 0)

  const [selectedTxId, setSelectedTxId] = useState<string>("")
  const [amountEuros, setAmountEuros] = useState<string>("")

  useEffect(() => {
    if (!open) {
      setSelectedTxId("")
      setAmountEuros("")
    }
  }, [open])

  const transactions: ReconcileTx[] = useMemo(() => {
    // Linking an invoice is usually paired with an income transaction (client
    // paid us). Expense transactions can also be valid — that's a refund
    // (we paid the client back). Both are allowed; currency check happens
    // on submit.
    return reconcile?.transactions ?? []
  }, [reconcile])

  const selectedTx = transactions.find((tx) => tx.id === selectedTxId)
  const txOutstanding = selectedTx
    ? Math.max(selectedTx.totalCents - selectedTx.allocatedCents, 0)
    : 0

  // When the user picks a transaction, default the allocation to the smaller
  // of (invoice outstanding) and (transaction outstanding). This is the
  // sensible default for both the single-invoice and cash-bundling cases.
  useEffect(() => {
    if (!selectedTx) return
    const suggested = Math.min(outstanding, txOutstanding) / 100
    setAmountEuros(suggested.toFixed(2))
  }, [selectedTxId, selectedTx, outstanding, txOutstanding])

  const createPayment = trpc.invoicePayments.create.useMutation({
    onSuccess: () => {
      onLinked()
      onOpenChange(false)
    },
  })

  const onSubmit = () => {
    if (!selectedTxId) return
    const euros = Number.parseFloat(amountEuros)
    if (!Number.isFinite(euros) || euros <= 0) return
    const cents = Math.round(euros * 100)
    createPayment.mutate({
      invoiceId,
      transactionId: selectedTxId,
      amountCents: cents,
      source: "manual",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("link.title")}</DialogTitle>
          <DialogDescription>
            {t("link.subtitle", {
              outstanding: formatCurrency(outstanding, invoiceCurrency),
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("link.loading")}</p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("link.noCandidates")}</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto rounded-md border">
            {transactions.map((tx) => {
              const unallocated = Math.max(tx.totalCents - tx.allocatedCents, 0)
              const selected = tx.id === selectedTxId
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTxId(tx.id)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-primary/10"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {tx.name || tx.merchant || t("link.unnamedTransaction")}
                      </span>
                      {tx.allocatedCents > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("link.partiallyAllocated", {
                            allocated: formatCurrency(tx.allocatedCents, tx.currencyCode ?? invoiceCurrency),
                          })}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {tx.issuedAt ? format(tx.issuedAt, "yyyy-MM-dd") : "—"}
                      {tx.merchant && tx.name ? ` · ${tx.merchant}` : ""}
                      {tx.type ? ` · ${tx.type}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-right">
                    <span className="font-medium">
                      {formatCurrency(tx.totalCents, tx.currencyCode ?? invoiceCurrency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("link.unallocated", {
                        amount: formatCurrency(unallocated, tx.currencyCode ?? invoiceCurrency),
                      })}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selectedTx && (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="link-amount">{t("link.amountLabel")}</Label>
              <Input
                id="link-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amountEuros}
                onChange={(e) => setAmountEuros(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground pb-2">
              {t("link.amountHint")}
            </p>
          </div>
        )}

        {createPayment.error && (
          <p className="text-sm text-destructive">{createPayment.error.message}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("link.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={
              !selectedTxId ||
              createPayment.isPending ||
              !Number.isFinite(Number.parseFloat(amountEuros)) ||
              Number.parseFloat(amountEuros) <= 0
            }
          >
            {createPayment.isPending ? t("link.linking") : t("link.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
