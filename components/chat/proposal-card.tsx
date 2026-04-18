import { Button } from "@/components/ui/button"
import { Check, X, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { trpc } from "~/trpc"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type {
  ProposedAction,
  CreateRuleAction,
  UpdateTransactionAction,
  ApplyRuleToExistingAction,
  BulkUpdateAction,
  PairTransfersBulkAction,
} from "@/lib/db-types"

type Props = {
  action: ProposedAction
  applied: boolean
  onApply: () => Promise<void>
}

export function ProposalCard({ action, applied, onApply }: Props) {
  const t = useTranslations("chat")
  const [dismissed, setDismissed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  const desc = describeAction(action, t)

  if (applied) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700 border border-green-200">
        <Check className="h-3.5 w-3.5" />
        {desc.title}: {t("applied")}
      </div>
    )
  }
  if (dismissed) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        {desc.title}: {t("dismissed")}
      </div>
    )
  }

  const run = async () => {
    setPending(true)
    setError(null)
    try {
      if (desc.destructive && desc.confirmBody) {
        const ok = await confirm({
          title: desc.title,
          description: desc.confirmBody,
          confirmLabel: t("apply"),
          variant: "destructive",
        })
        if (!ok) {
          setPending(false)
          return
        }
      }
      await onApply()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn("mt-2 rounded border border-border bg-card p-2 text-xs")}>
      <div className="mb-1 font-medium">{desc.title}</div>
      <div className="mb-2 text-muted-foreground">{desc.summary}</div>
      <PreviewBlock action={action} onTooMany={(count) => setError(t("actions.tooManyMatches", { count }))} />
      {error && <div className="mb-2 text-red-600">{error}</div>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={run}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t("apply")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDismissed(true)}>
          <X className="h-3.5 w-3.5" />
          {t("dismiss")}
        </Button>
      </div>
    </div>
  )
}

function PreviewBlock({
  action,
  onTooMany,
}: {
  action: ProposedAction
  onTooMany: (count: number) => void
}) {
  const t = useTranslations("chat")
  const previewRule = trpc.chat.previewRuleApplication.useMutation()
  const previewBulk = trpc.chat.previewBulkUpdate.useMutation()
  const accountsQuery = trpc.accounts.listActive.useQuery(
    {},
    { enabled: action.kind === "pairTransfersBulk" },
  )

  useEffect(() => {
    if (action.kind === "applyRuleToExisting") {
      previewRule.mutate({ ruleSpec: action.ruleSpec })
    } else if (action.kind === "bulkUpdate") {
      previewBulk.mutate({ filter: action.filter })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const data =
    action.kind === "applyRuleToExisting" ? previewRule.data
    : action.kind === "bulkUpdate" ? previewBulk.data
    : null

  useEffect(() => {
    if (data && data.matchCount > 1000) onTooMany(data.matchCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.matchCount])

  if (action.kind === "pairTransfersBulk") {
    const accounts = accountsQuery.data ?? []
    const fromName = accounts.find((a) => a.id === action.fromAccountId)?.name ?? action.fromAccountId
    const toName = accounts.find((a) => a.id === action.toAccountId)?.name ?? action.toAccountId
    return (
      <div className="mb-2 text-muted-foreground">
        {t("actions.pairTransfersBulkDescription", {
          from: fromName,
          to: toName,
        })}
        {action.sinceDate ? ` · ≥ ${action.sinceDate}` : ""}
      </div>
    )
  }

  if (action.kind !== "applyRuleToExisting" && action.kind !== "bulkUpdate") return null

  if (previewRule.isPending || previewBulk.isPending) {
    return (
      <div className="mb-2 text-muted-foreground inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    )
  }
  if (!data) return null
  return (
    <div className="mb-2 text-muted-foreground">
      {t("actions.willAffectCount", { count: data.matchCount })}
    </div>
  )
}

function describeAction(
  action: ProposedAction,
  t: ReturnType<typeof useTranslations>,
): { title: string; summary: string; destructive: boolean; confirmBody?: string } {
  switch (action.kind) {
    case "createRule":
      return {
        title: t("proposalRuleTitle"),
        summary: summarizeCreateRule(action),
        destructive: false,
      }
    case "updateTransaction":
      return {
        title: t("proposalUpdateTitle"),
        summary: summarizeUpdateTx(action),
        destructive: false,
      }
    case "applyRuleToExisting":
      return {
        title: t("actions.applyRuleToExistingTitle"),
        summary: summarizeApplyRule(action),
        destructive: false,
      }
    case "bulkUpdate":
      return {
        title: t("actions.bulkUpdateTitle"),
        summary: summarizeBulkUpdate(action),
        destructive: true,
        confirmBody: t("actions.confirmBulkBody", { count: 0 }),
      }
    case "createCategory":
      return {
        title: t("actions.createCategoryTitle"),
        summary: `${action.name}${action.color ? ` · ${action.color}` : ""}`,
        destructive: false,
      }
    case "createProject":
      return {
        title: t("actions.createProjectTitle"),
        summary: `${action.name}${action.color ? ` · ${action.color}` : ""}`,
        destructive: false,
      }
    case "deleteTransaction":
      return {
        title: t("actions.deleteTransactionTitle"),
        summary: `id: ${action.transactionId}`,
        destructive: true,
        confirmBody: t("actions.confirmDeleteTransactionBody"),
      }
    case "deleteRule":
      return {
        title: t("actions.deleteRuleTitle"),
        summary: `id: ${action.ruleId}`,
        destructive: true,
        confirmBody: t("actions.confirmDeleteRuleBody"),
      }
    case "pairTransfersBulk":
      return {
        title: t("actions.pairTransfersBulkTitle"),
        summary: summarizePairTransfersBulk(action),
        destructive: false,
      }
  }
}

function summarizeCreateRule(a: CreateRuleAction): string {
  const target = a.categoryCode ? `category=${a.categoryCode}` : a.type ? `type=${a.type}` : "(no target)"
  return `When ${a.matchField} ${a.matchType} "${a.matchValue}" → ${target}`
}
function summarizeUpdateTx(a: UpdateTransactionAction): string {
  const entries = Object.entries(a.patch).filter(([, v]) => v !== undefined && v !== null && v !== "")
  if (entries.length === 0) return "(no change)"
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ")
}
function summarizeApplyRule(a: ApplyRuleToExistingAction): string {
  const target = a.ruleSpec.categoryCode ? `category=${a.ruleSpec.categoryCode}` : a.ruleSpec.type ? `type=${a.ruleSpec.type}` : "(no target)"
  const also = a.alsoCreate ? " (also create rule)" : ""
  return `${a.ruleSpec.matchField} ${a.ruleSpec.matchType} "${a.ruleSpec.matchValue}" → ${target}${also}`
}
function summarizeBulkUpdate(a: BulkUpdateAction): string {
  const f = Object.entries(a.filter).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "(no filter)"
  const p = Object.entries(a.patch).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join(", ") || "(no change)"
  return `filter: ${f}  →  patch: ${p}`
}
function summarizePairTransfersBulk(a: PairTransfersBulkAction): string {
  const since = a.sinceDate ? ` since ${a.sinceDate}` : ""
  return `from ${a.fromAccountId} → to ${a.toAccountId}${since}`
}
