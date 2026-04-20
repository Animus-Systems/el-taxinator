import { useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, ExternalLink, Link2, Unlink } from "lucide-react"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter } from "@/lib/navigation"
import { cn, formatCurrency } from "@/lib/utils"
import type { Transaction } from "@/lib/db-types"

type Props = {
  transaction: Transaction
  onBeforeNavigate?: (() => void) | undefined
}

// Sentinel used by the Select for "no counter-account, just external".
// Radix SelectItem disallows empty-string values, so we map "" <-> this token.
const EXTERNAL_SENTINEL = "__external__"

/**
 * Info row shown at the top of the transaction edit form when the row is a
 * transfer or a currency conversion. Renders:
 *   - paired state with a link to the counter-leg + an unlink button
 *   - orphan state with an account picker to set `counter_account_id`
 *   - for conversions: an optional realized-FX-gain line when populated
 *   - nothing when the transaction isn't a transfer/conversion
 *
 * Conversions share the same transfer_id pairing machinery as transfers; the
 * wording differs slightly ("linked as currency conversion").
 */
export function TransferDetailRow({ transaction, onBeforeNavigate }: Props) {
  // react-i18next only recognizes top-level keys as namespaces. Scope to
  // "transactions" and use dotted keys like "transferDetail.unmatchedLabel".
  const tTx = useTranslations("transactions")
  const t = (k: string, vars?: Record<string, string | number>): string =>
    vars === undefined
      ? tTx(`transferDetail.${k}`)
      : tTx(`transferDetail.${k}`, vars)
  const confirm = useConfirm()
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: accounts = [] } = trpc.accounts.listActive.useQuery({})
  const {
    transferId,
    transferDirection,
    counterAccountId,
    type,
    realizedFxGainCents,
    convertedCurrencyCode,
    currencyCode,
  } = transaction

  const isTransfer = type === "transfer"
  const isConversion = type === "exchange"
  const isRelevant = isTransfer || isConversion
  const isPaired = isRelevant && transferId !== null

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

  const setCounterAccount = trpc.transactions.setCounterAccount.useMutation({
    onSuccess: () => {
      void utils.transactions.list.invalidate()
      void utils.transactions.getById.invalidate({ id: transaction.id })
    },
  })

  const initialPicked = counterAccountId ?? ""
  const [picked, setPicked] = useState<string>(initialPicked)

  const counterAccount = counterAccountId
    ? accounts.find((a) => a.id === counterAccountId) ?? null
    : null

  if (!isRelevant) return null

  // Orphan: no counterparty linked yet. Offer an inline account picker that
  // writes to `counter_account_id` without engaging the pairing machinery.
  if (!isPaired) {
    const handleSave = () => {
      setCounterAccount.mutate({
        id: transaction.id,
        counterAccountId: picked === "" ? null : picked,
      })
    }
    const hasChange = picked !== initialPicked
    const headerLabel = counterAccount
      ? t("orphanWithAccountLabel", { name: counterAccount.name })
      : t("unmatchedLabel")

    return (
      <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">{headerLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">{t("pickCounterAccount")}</label>
          <Select
            value={picked === "" ? EXTERNAL_SENTINEL : picked}
            onValueChange={(v) => setPicked(v === EXTERNAL_SENTINEL ? "" : v)}
          >
            <SelectTrigger className="h-8 min-w-[180px] text-xs">
              <SelectValue placeholder={t("pickCounterAccountPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EXTERNAL_SENTINEL}>
                {t("externalCounterparty")}
              </SelectItem>
              {accounts
                .filter((a) => a.id !== transaction.accountId)
                .map((a) => (
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
            variant="outline"
            onClick={handleSave}
            disabled={setCounterAccount.isPending || !hasChange}
            className="h-8 gap-1 px-2 text-xs"
          >
            {t("saveCounterAccount")}
          </Button>
        </div>
        {isConversion && realizedFxGainCents !== null && (
          <div className="font-mono text-xs">
            {t("realizedFxGain", {
              amount: formatCurrency(realizedFxGainCents, convertedCurrencyCode ?? currencyCode ?? "EUR"),
            })}
          </div>
        )}
      </div>
    )
  }

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

  const linkedLabel = isConversion ? t("conversionLinkedLabel") : t("linkedLabel")
  const containerClasses = isConversion
    ? "border-purple-200 bg-purple-50 text-purple-900"
    : "border-sky-200 bg-sky-50 text-sky-900"
  const separatorClasses = isConversion ? "text-purple-700" : "text-sky-700"

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
        containerClasses,
      )}
    >
      <Link2 className="h-4 w-4 shrink-0" />
      <span className="font-medium">{linkedLabel}</span>
      <span className={separatorClasses}>·</span>
      <span className="font-mono">
        {arrow} {counterName}
      </span>
      {isConversion && realizedFxGainCents !== null && (
        <span className={cn("text-xs font-mono", separatorClasses)}>
          ·{" "}
          {t("realizedFxGain", {
            amount: formatCurrency(realizedFxGainCents, convertedCurrencyCode ?? currencyCode ?? "EUR"),
          })}
        </span>
      )}
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
