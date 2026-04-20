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
  purchaseId: string
  outstandingCents: number
  includeIncome?: boolean
}

export function LinkPurchaseToTransactionDialog({
  open,
  onOpenChange,
  purchaseId,
  outstandingCents,
  includeIncome = false,
}: Props) {
  const { t } = useTranslation("purchases")
  const utils = trpc.useUtils()

  const { data: reconcile, isLoading } = trpc.purchasePayments.reconcileData.useQuery(
    { includeIncome },
    { enabled: open },
  )

  const [selectedTxId, setSelectedTxId] = useState<string>("")
  const [amountEuros, setAmountEuros] = useState<string>("")

  useEffect(() => {
    if (!open) {
      setSelectedTxId("")
      setAmountEuros("")
    }
  }, [open])

  const transactions: ReconcileTx[] = useMemo(() => {
    return reconcile?.transactions ?? []
  }, [reconcile])

  const selectedTx = transactions.find((tx) => tx.id === selectedTxId)
  const txOutstanding = selectedTx
    ? Math.max(selectedTx.totalCents - selectedTx.allocatedCents, 0)
    : 0

  useEffect(() => {
    if (!selectedTx) return
    const suggested = Math.min(outstandingCents, txOutstanding) / 100
    setAmountEuros(suggested.toFixed(2))
  }, [selectedTxId, selectedTx, outstandingCents, txOutstanding])

  const createPayment = trpc.purchasePayments.create.useMutation({
    onSuccess: () => {
      utils.purchasePayments.listForPurchase.invalidate({ purchaseId })
      utils.purchases.getById.invalidate({ id: purchaseId })
      utils.purchases.list.invalidate()
      onOpenChange(false)
    },
  })

  function onSubmit(): void {
    if (!selectedTxId) return
    const euros = Number.parseFloat(amountEuros)
    if (!Number.isFinite(euros) || euros <= 0) return
    const cents = Math.round(euros * 100)
    createPayment.mutate({
      purchaseId,
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
              outstanding: formatCurrency(outstandingCents, "EUR"),
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("link.loading")}</p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("link.noCandidates")}
          </p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto rounded-md border">
            {transactions.map((tx) => {
              const unallocated = Math.max(tx.totalCents - tx.allocatedCents, 0)
              const selected = tx.id === selectedTxId
              const ccy = tx.currencyCode ?? "EUR"
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTxId(tx.id)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    selected ? "bg-primary/10" : "hover:bg-muted/60"
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
                            allocated: formatCurrency(tx.allocatedCents, ccy),
                          })}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {tx.issuedAt ? format(tx.issuedAt, "yyyy-MM-dd") : "—"}
                      {tx.merchant && tx.name ? ` · ${tx.merchant}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-right">
                    <span className="font-medium">{formatCurrency(tx.totalCents, ccy)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("link.unallocated", {
                        amount: formatCurrency(unallocated, ccy),
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
