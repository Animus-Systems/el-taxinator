import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, Loader2, ShoppingBag, Sparkles } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { ExtractedReceipt } from "@/ai/extract-receipt"

type UploadedReceipt = {
  fileId: string
  filename: string
  mimetype: string
  extracted: ExtractedReceipt
}

type Decision =
  | { action: "attach"; transactionId: string }
  | { action: "create" }
  | { action: "orphan" }

type RowState = {
  vendor: string
  totalEuros: string
  issueDate: string
  notes: string
  decision: Decision
  aiTransactionId: string | null
  aiConfidence: number | null
  aiReasoning: string | null
}

type Props = {
  receipts: UploadedReceipt[]
  onComplete: (counts: { attached: number; created: number; orphaned: number }) => void
  onCancel: () => void
}

function defaultRowState(r: UploadedReceipt): RowState {
  return {
    vendor: r.extracted.vendor ?? "",
    totalEuros: r.extracted.total != null ? String(r.extracted.total) : "",
    issueDate: r.extracted.issueDate ?? "",
    notes: r.extracted.notes ?? "",
    decision: { action: "orphan" },
    aiTransactionId: null,
    aiConfidence: null,
    aiReasoning: null,
  }
}

export function ReceiptsReview({ receipts, onComplete, onCancel }: Props) {
  const t = useTranslations("transactions")

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {}
    for (const r of receipts) out[r.fileId] = defaultRowState(r)
    return out
  })

  const fileIds = useMemo(() => receipts.map((r) => r.fileId), [receipts])

  const candidates = trpc.receipts.candidateTransactions.useQuery({})
  const txOptions = candidates.data ?? []

  const aiMatch = trpc.receipts.aiMatch.useMutation({
    onSuccess: (suggestions) => {
      setRows((prev) => {
        const next = { ...prev }
        for (const s of suggestions) {
          const cur = next[s.fileId]
          if (!cur) continue
          next[s.fileId] = {
            ...cur,
            decision: { action: "attach", transactionId: s.transactionId },
            aiTransactionId: s.transactionId,
            aiConfidence: s.confidence,
            aiReasoning: s.reasoning,
          }
        }
        return next
      })
    },
  })

  // Run AI match once on mount.
  useEffect(() => {
    aiMatch.mutate({ fileIds })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = trpc.receipts.commit.useMutation({
    onSuccess: (counts) => onComplete(counts),
  })

  const [convertedToPurchase, setConvertedToPurchase] = useState<Set<string>>(new Set())

  const createPurchaseFromReceipt = trpc.purchases.createFromReceipt.useMutation({
    onSuccess: (_purchase, vars) => {
      setConvertedToPurchase((prev) => {
        const next = new Set(prev)
        next.add(vars.fileId)
        return next
      })
      toast.success(t("receipts.purchaseDraftCreated"))
    },
    onError: (err) => toast.error(err.message),
  })

  const updateRow = (fileId: string, patch: Partial<RowState>) =>
    setRows((prev) => {
      const cur = prev[fileId]
      if (!cur) return prev
      return { ...prev, [fileId]: { ...cur, ...patch } }
    })

  const handleCommit = () => {
    const decisions: Array<
      | { action: "attach"; fileId: string; transactionId: string }
      | {
          action: "create"
          fileId: string
          vendor: string
          totalEuros: number
          issueDate: string
          notes: string | null
        }
      | { action: "orphan"; fileId: string }
    > = []

    for (const r of receipts) {
      if (convertedToPurchase.has(r.fileId)) continue
      const state = rows[r.fileId]
      if (!state) continue
      if (state.decision.action === "attach") {
        decisions.push({
          action: "attach",
          fileId: r.fileId,
          transactionId: state.decision.transactionId,
        })
      } else if (state.decision.action === "create") {
        const totalEuros = Number.parseFloat(state.totalEuros)
        if (!state.vendor.trim() || !Number.isFinite(totalEuros) || !state.issueDate) {
          continue
        }
        decisions.push({
          action: "create",
          fileId: r.fileId,
          vendor: state.vendor.trim(),
          totalEuros,
          issueDate: state.issueDate,
          notes: state.notes.trim() || null,
        })
      } else {
        decisions.push({ action: "orphan", fileId: r.fileId })
      }
    }

    if (decisions.length === 0) return
    commit.mutate({ decisions })
  }

  const isMatching = aiMatch.isPending

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("receipts.reviewHeading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("receipts.reviewSubtitle", { count: receipts.length })}
          </p>
        </div>
        {isMatching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("receipts.matching")}
          </div>
        )}
      </header>

      <ul className="space-y-3">
        {receipts.map((receipt) => {
          const state = rows[receipt.fileId]
          if (!state) return null

          const matchedTx = state.aiTransactionId
            ? txOptions.find((tx) => tx.id === state.aiTransactionId)
            : null

          return (
            <li key={receipt.fileId}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <a
                      href={`/files/view/${receipt.fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-primary hover:underline"
                      title={receipt.filename}
                    >
                      {receipt.filename}
                    </a>
                    {state.aiConfidence != null && (
                      <Badge
                        variant={state.aiConfidence >= 0.7 ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        {Math.round(state.aiConfidence * 100)}%
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <label className="text-xs text-muted-foreground">
                      {t("receipts.fieldVendor")}
                      <Input
                        value={state.vendor}
                        onChange={(event) =>
                          updateRow(receipt.fileId, { vendor: event.target.value })
                        }
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      {t("receipts.fieldTotal")}
                      <Input
                        type="number"
                        step="0.01"
                        value={state.totalEuros}
                        onChange={(event) =>
                          updateRow(receipt.fileId, { totalEuros: event.target.value })
                        }
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      {t("receipts.fieldDate")}
                      <Input
                        type="date"
                        value={state.issueDate}
                        onChange={(event) =>
                          updateRow(receipt.fileId, { issueDate: event.target.value })
                        }
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      {t("receipts.fieldNotes")}
                      <Input
                        value={state.notes}
                        onChange={(event) =>
                          updateRow(receipt.fileId, { notes: event.target.value })
                        }
                        className="mt-1"
                      />
                    </label>
                  </div>

                  {state.aiReasoning && (
                    <p className="text-xs text-muted-foreground">
                      {t("receipts.aiSaid")}: {state.aiReasoning}
                    </p>
                  )}

                  {convertedToPurchase.has(receipt.fileId) ? (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                      <Check className="h-4 w-4" />
                      {t("receipts.purchaseDraftCreated")}
                    </div>
                  ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={
                        state.decision.action === "attach"
                          ? `attach:${state.decision.transactionId}`
                          : state.decision.action === "create"
                            ? "create"
                            : "orphan"
                      }
                      onValueChange={(value) => {
                        if (value === "create") {
                          updateRow(receipt.fileId, { decision: { action: "create" } })
                        } else if (value === "orphan") {
                          updateRow(receipt.fileId, { decision: { action: "orphan" } })
                        } else if (value.startsWith("attach:")) {
                          const txId = value.slice("attach:".length)
                          updateRow(receipt.fileId, {
                            decision: { action: "attach", transactionId: txId },
                          })
                        }
                      }}
                    >
                      <SelectTrigger className="min-w-[280px]">
                        <SelectValue placeholder={t("receipts.pickMatch")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create">{t("receipts.createNewTx")}</SelectItem>
                        <SelectItem value="orphan">{t("receipts.leaveOrphan")}</SelectItem>
                        {txOptions.length > 0 && (
                          <div className="px-2 py-1 text-xs text-muted-foreground">
                            {t("receipts.matchToTx")}
                          </div>
                        )}
                        {txOptions.map((tx) => (
                          <SelectItem key={tx.id} value={`attach:${tx.id}`}>
                            {(tx.merchant || tx.name || tx.id.slice(0, 8)) +
                              " · " +
                              formatCurrency(tx.totalCents, tx.currencyCode ?? "EUR") +
                              (tx.issuedAt
                                ? " · " + new Date(tx.issuedAt).toISOString().slice(0, 10)
                                : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {state.decision.action === "attach" && matchedTx && (
                      <span className="text-xs text-muted-foreground">
                        → {matchedTx.merchant || matchedTx.name} ·{" "}
                        {formatCurrency(matchedTx.totalCents, matchedTx.currencyCode ?? "EUR")}
                      </span>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={createPurchaseFromReceipt.isPending}
                      onClick={() =>
                        createPurchaseFromReceipt.mutate({ fileId: receipt.fileId })
                      }
                      title={t("receipts.createPurchaseDraft")}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span className="hidden md:inline">{t("receipts.createPurchaseDraft")}</span>
                    </Button>
                  </div>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      {commit.error && <p className="text-sm text-destructive">{commit.error.message}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={commit.isPending}
        >
          {t("receipts.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleCommit}
          disabled={commit.isPending || receipts.length === 0}
        >
          {commit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t("receipts.commitAll")}
        </Button>
      </div>
    </div>
  )
}
