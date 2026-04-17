
import { bulkDeleteTransactionsAction } from "@/actions/transactions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeftRight, Repeat, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { formatCurrency } from "@/lib/utils"
import type { Transaction } from "@/lib/db-types"

interface BulkActionsMenuProps {
  selectedIds: string[]
  /**
   * Subset of loaded transactions matching `selectedIds`. Required to enable
   * the "Link as transfer" action — for bulk delete we only need ids.
   */
  selectedTransactions?: Transaction[]
  onActionComplete?: () => void
}

/**
 * Holds the two legs of a pending transfer link + which is outgoing.
 * Separated from render state so we can swap direction in-dialog.
 */
type PendingLink = {
  first: Transaction
  second: Transaction
  outgoingId: string
}

export function BulkActionsMenu({
  selectedIds,
  selectedTransactions,
  onActionComplete,
}: BulkActionsMenuProps) {
  const confirm = useConfirm()
  const t = useTranslations("transactions.bulkActions")
  const utils = trpc.useUtils()
  const [isLoading, setIsLoading] = useState(false)
  const [pending, setPending] = useState<PendingLink | null>(null)

  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
  const accountById = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) map.set(a.id, a.name)
    return map
  }, [accounts])

  const confirmLink = trpc.transactions.confirmTransferLink.useMutation()

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${selectedIds.length} transactions?`,
      description:
        "Are you sure you want to delete these transactions and all their files? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!ok) return

    try {
      setIsLoading(true)
      const result = await bulkDeleteTransactionsAction(selectedIds)
      if (!result.success) {
        throw new Error(result.error)
      }
      onActionComplete?.()
    } catch (error) {
      console.error("Failed to delete transactions:", error)
      alert(`Failed to delete transactions: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const canLinkAsTransfer =
    selectedIds.length === 2 && (selectedTransactions?.length ?? 0) === 2

  /**
   * Client-side validation + direction inference. Opens the confirm dialog
   * on success, shows a toast otherwise.
   */
  const handleStartLink = () => {
    if (!selectedTransactions || selectedTransactions.length !== 2) return
    const [a, b] = selectedTransactions as [Transaction, Transaction]

    if (!a.accountId || !b.accountId) {
      toast.error(t("linkAsTransferNeedsAccounts"))
      return
    }
    if (a.accountId === b.accountId) {
      toast.error(t("linkAsTransferSameAccount"))
      return
    }
    if (a.transferId !== null || b.transferId !== null) {
      toast.error(t("linkAsTransferAlreadyLinked"))
      return
    }
    if (a.currencyCode !== b.currencyCode) {
      toast.error(t("linkAsTransferCurrencyMismatch"))
      return
    }

    // Warn (but don't block) on amount or date mismatch.
    const amountsMatch = Math.abs((a.total ?? 0)) === Math.abs((b.total ?? 0))
    const datesWithinDay =
      a.issuedAt && b.issuedAt
        ? Math.abs(new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()) <=
          24 * 60 * 60 * 1000
        : false
    if (!amountsMatch || !datesWithinDay) {
      toast.warning(t("linkAsTransferAmountMismatch"))
    }

    // Direction inference:
    //   expense + income → expense is outgoing, income is incoming.
    //   Otherwise fall back to sign: the row with the more-negative total is outgoing.
    //   Users can flip in the dialog.
    let outgoingId: string
    if (a.type === "expense" && b.type === "income") outgoingId = a.id
    else if (a.type === "income" && b.type === "expense") outgoingId = b.id
    else if ((a.total ?? 0) < (b.total ?? 0)) outgoingId = a.id
    else outgoingId = b.id

    setPending({ first: a, second: b, outgoingId })
  }

  const handleConfirmLink = async () => {
    if (!pending) return
    const { first, second, outgoingId } = pending
    const outgoing = outgoingId === first.id ? first : second
    const incoming = outgoingId === first.id ? second : first
    if (!outgoing.accountId || !incoming.accountId) return

    try {
      setIsLoading(true)
      await confirmLink.mutateAsync({
        outgoingId: outgoing.id,
        outgoingAccountId: outgoing.accountId,
        incomingId: incoming.id,
        incomingAccountId: incoming.accountId,
      })
      await utils.transactions.list.invalidate()
      toast.success(t("linkAsTransferSuccess"))
      setPending(null)
      onActionComplete?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`${t("linkAsTransferError")}: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const renderDirectionBody = () => {
    if (!pending) return null
    const { first, second, outgoingId } = pending
    const outgoing = outgoingId === first.id ? first : second
    const incoming = outgoingId === first.id ? second : first
    const total = Math.abs(outgoing.total ?? 0)
    const currency = outgoing.currencyCode ?? ""
    const amountStr = currency ? formatCurrency(total, currency) : String(total)
    const fromName = outgoing.accountId ? accountById.get(outgoing.accountId) ?? "?" : "?"
    const toName = incoming.accountId ? accountById.get(incoming.accountId) ?? "?" : "?"
    return (
      <div className="space-y-3">
        <p className="text-sm">
          {t("linkAsTransferFromTo", { amount: amountStr, from: fromName, to: toName })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setPending({
              ...pending,
              outgoingId: outgoingId === first.id ? second.id : first.id,
            })
          }
          className="gap-2"
        >
          <Repeat className="h-4 w-4" />
          {t("linkAsTransferSwap")}
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        {canLinkAsTransfer && (
          <Button
            variant="outline"
            className="min-w-48 gap-2 bg-background shadow-md"
            disabled={isLoading}
            onClick={handleStartLink}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {t("linkAsTransfer")}
          </Button>
        )}
        <Button
          variant="destructive"
          className="min-w-48 gap-2"
          disabled={isLoading}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete {selectedIds.length} transactions
        </Button>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("linkAsTransferDialogTitle")}</DialogTitle>
            <DialogDescription>{t("linkAsTransferDialogBody")}</DialogDescription>
          </DialogHeader>
          {renderDirectionBody()}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={isLoading}
            >
              {t("linkAsTransferCancel")}
            </Button>
            <Button type="button" onClick={handleConfirmLink} disabled={isLoading}>
              {t("linkAsTransferConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
