import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ChevronDown,
  ChevronRight,
  Coins,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { Transaction } from "@/lib/db-types"

type CryptoMetaRaw = {
  asset?: string
  quantity?: string
  pricePerUnit?: number | null
  costBasisPerUnit?: number | null
  costBasisSource?: "manual" | "fifo" | "imported"
  realizedGainCents?: number | null
  fxRate?: number | null
  gatewayTransactionId?: string | null
  fingerprint?: string | null
}

function centsToStr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  return (cents / 100).toFixed(2)
}

function parseCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function CryptoMetaSection({ transaction }: { transaction: Transaction }) {
  const { t } = useTranslation("crypto")
  const utils = trpc.useUtils()
  const initial = (transaction.extra as { crypto?: CryptoMetaRaw } | null)?.crypto ?? {}

  const [asset, setAsset] = useState(initial.asset ?? "")
  const [quantity, setQuantity] = useState(initial.quantity ?? "")
  const [priceStr, setPriceStr] = useState(centsToStr(initial.pricePerUnit ?? null))
  const [costStr, setCostStr] = useState(centsToStr(initial.costBasisPerUnit ?? null))
  const [realizedGain, setRealizedGain] = useState<number | null>(
    initial.realizedGainCents ?? null,
  )

  const update = trpc.crypto.updateCryptoMeta.useMutation({
    onSuccess: (res) => {
      setRealizedGain(res.realizedGainCents)
      utils.crypto.summary.invalidate()
      utils.crypto.listDisposals.invalidate()
      utils.transactions.getById.invalidate({ id: transaction.id })
    },
  })

  // Live-preview gain as user types
  useEffect(() => {
    const price = parseCents(priceStr)
    const cost = parseCents(costStr)
    const qty = Number(quantity) || 0
    if (price !== null && cost !== null && qty !== 0) {
      setRealizedGain(Math.round((price - cost) * qty))
    } else {
      setRealizedGain(null)
    }
  }, [priceStr, costStr, quantity])

  const onSave = () => {
    update.mutate({
      transactionId: transaction.id,
      crypto: {
        asset: asset || undefined,
        quantity: quantity || undefined,
        pricePerUnit: parseCents(priceStr),
        costBasisPerUnit: parseCents(costStr),
      },
    })
  }

  const currency = transaction.currencyCode ?? "EUR"
  const gainText =
    realizedGain === null
      ? "—"
      : formatCurrency(realizedGain, currency)

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-medium tracking-tight">
        <Coins className="h-4 w-4 text-amber-500" />
        {t("metaHeading")}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label htmlFor="crypto-asset" className="text-[11px]">
            {t("assetLabel")}
          </Label>
          <Input
            id="crypto-asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value.toUpperCase())}
            placeholder="BTC"
            className="mt-0.5"
          />
        </div>
        <div>
          <Label htmlFor="crypto-quantity" className="text-[11px]">
            {t("quantityLabel")}
          </Label>
          <Input
            id="crypto-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.05"
            inputMode="decimal"
            className="mt-0.5"
          />
        </div>
        <div>
          <Label htmlFor="crypto-price" className="text-[11px]">
            {t("pricePerUnitLabel", { currency })}
          </Label>
          <Input
            id="crypto-price"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            placeholder="55000.00"
            inputMode="decimal"
            className="mt-0.5"
          />
        </div>
        <div>
          <Label htmlFor="crypto-cost" className="text-[11px]">
            {t("costBasisPerUnitLabel", { currency })}
          </Label>
          <Input
            id="crypto-cost"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            placeholder="35000.00"
            inputMode="decimal"
            className="mt-0.5"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-[12px] flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-muted-foreground">{t("realizedGainLabel")}:</span>
          <span
            className={[
              "font-medium tabular-nums",
              realizedGain !== null && realizedGain > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
              realizedGain !== null && realizedGain < 0 ? "text-rose-600 dark:text-rose-400" : "",
            ].join(" ")}
          >
            {gainText}
          </span>
        </div>
        <Button size="sm" onClick={onSave} disabled={update.isPending} className="rounded-full">
          {update.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t("saveMeta")}
        </Button>
      </div>
      {update.error ? (
        <p className="text-[11px] text-destructive">{update.error.message}</p>
      ) : null}

      <MatchedLots transactionId={transaction.id} currency={currency} />
    </div>
  )
}

function MatchedLots({
  transactionId,
  currency,
}: {
  transactionId: string
  currency: string
}) {
  const { t } = useTranslation("crypto")
  const [open, setOpen] = useState(false)
  const { data: matches = [], isLoading } = trpc.crypto.listDisposalMatches.useQuery(
    { disposalTransactionId: transactionId },
    { enabled: open },
  )

  return (
    <div className="border-t border-border/40 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {t("matchedLotsHeading")}
      </button>
      {open ? (
        isLoading ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-2 text-[11px] text-muted-foreground italic">
            {t("matchedLotsEmpty")}
          </div>
        ) : (
          <div className="mt-2 space-y-1 text-[11px]">
            {matches.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 tabular-nums text-muted-foreground"
              >
                <span className="font-mono text-[10px]">{m.lotId.slice(0, 8)}</span>
                <span>·</span>
                <span>{Number(m.quantityConsumed).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
                <span>·</span>
                <span>cost {formatCurrency(m.costBasisCents, currency)}</span>
                <span>·</span>
                <span>proceeds {formatCurrency(m.proceedsCents, currency)}</span>
                <span
                  className={[
                    "ml-auto",
                    m.realizedGainCents > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
                    m.realizedGainCents < 0 ? "text-rose-600 dark:text-rose-400" : "",
                  ].join(" ")}
                >
                  {formatCurrency(m.realizedGainCents, currency)}
                </span>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

export function shouldShowCryptoMeta(transaction: Transaction): boolean {
  if ((transaction.categoryCode ?? "").startsWith("crypto_")) return true
  const extra = transaction.extra as { crypto?: unknown } | null
  return Boolean(extra && typeof extra === "object" && "crypto" in extra && extra.crypto)
}
