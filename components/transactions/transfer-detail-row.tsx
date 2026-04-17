import { useTranslations } from "next-intl"
import { AlertTriangle, ExternalLink, Link2, Unlink } from "lucide-react"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useRouter } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import type { Transaction } from "@/lib/db-types"

type Props = {
  transaction: Transaction
  onBeforeNavigate?: (() => void) | undefined
}

/**
 * Info row shown at the top of the transaction edit form when the row is a
 * transfer. Renders:
 *   - paired state with a link to the counter-leg + an unlink button
 *   - orphan state as a warning notice
 *   - nothing when the transaction isn't a transfer
 */
export function TransferDetailRow({ transaction, onBeforeNavigate }: Props) {
  const t = useTranslations("transactions.transferDetail")
  const confirm = useConfirm()
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
  const { transferId, transferDirection, counterAccountId, type } = transaction

  const isTransfer = type === "transfer"
  const isPaired = isTransfer && transferId !== null

  const { data: pairedLeg } = trpc.transactions.getPairedLeg.useQuery(
    isPaired && transferId
      ? { transferId, excludeId: transaction.id }
      : { transferId: "00000000-0000-0000-0000-000000000000", excludeId: transaction.id },
    { enabled: isPaired && transferId !== null },
  )

  const unlink = trpc.transactions.unlinkTransfer.useMutation({
    onSuccess: () => {
      void utils.transactions.list.invalidate()
      void utils.transactions.getById.invalidate({ id: transaction.id })
      if (pairedLeg) {
        void utils.transactions.getById.invalidate({ id: pairedLeg.id })
      }
    },
  })

  if (!isTransfer) return null

  // Orphan transfer: no counterparty linked yet.
  if (!isPaired) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{t("unmatchedLabel")}</span>
      </div>
    )
  }

  const counterAccount = counterAccountId
    ? accounts.find((a) => a.id === counterAccountId) ?? null
    : null
  const arrow = transferDirection === "outgoing" ? "→" : transferDirection === "incoming" ? "←" : "↔"
  const counterName = counterAccount?.name ?? "…"

  const handleOpenPaired = () => {
    if (!pairedLeg) return
    onBeforeNavigate?.()
    router.push(`/transactions?tx=${pairedLeg.id}`)
  }

  const handleUnlink = async () => {
    if (!transferId) return
    const ok = await confirm({
      title: t("unlinkConfirmTitle"),
      description: t("unlinkConfirmBody"),
      confirmLabel: t("unlink"),
      variant: "destructive",
    })
    if (!ok) return
    await unlink.mutateAsync({ transferId })
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50",
        "px-3 py-2 text-sm text-sky-900",
      )}
    >
      <Link2 className="h-4 w-4 shrink-0" />
      <span className="font-medium">{t("linkedLabel")}</span>
      <span className="text-sky-700">·</span>
      <span className="font-mono">
        {arrow} {counterName}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenPaired}
          disabled={!pairedLeg}
          className="h-7 gap-1 px-2 text-xs"
        >
          <ExternalLink className="h-3 w-3" />
          {t("openPaired")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleUnlink}
          disabled={unlink.isPending}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Unlink className="h-3 w-3" />
          {t("unlink")}
        </Button>
      </div>
    </div>
  )
}
