/**
 * Bulk review tool for historical mis-classifications.
 *
 * On open it calls `reclassifySuggestions`, groups proposals by suggested
 * type, and shows a checkable list. The user can accept/reject per row or
 * hit "Apply all" per group. Each group's apply runs the single
 * `bulkSetType` mutation with the accepted ids.
 *
 * Only rows where the heuristic classifier differs from the current type
 * appear — clean rows are not shown.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { formatCurrency, cn } from "@/lib/utils"
import { format } from "date-fns"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

type ProposedType = "income" | "expense" | "refund" | "transfer" | "exchange" | "other"

type Suggestion = {
  id: string
  name: string | null
  merchant: string | null
  description: string | null
  issuedAt: Date | null
  total: number | null
  currencyCode: string | null
  currentType: string | null
  suggestedType: ProposedType
  reason: string
}

const TYPE_CHIP: Record<ProposedType, string> = {
  income: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  refund: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  transfer: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  exchange: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  other: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
}

const GROUP_ORDER: ProposedType[] = [
  "refund",
  "exchange",
  "transfer",
  "income",
  "expense",
  "other",
]

export function ReclassifyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const { t } = useTranslation("transactions")
  const utils = trpc.useUtils()

  const { data: suggestions = [], isLoading } = trpc.transactions.reclassifySuggestions.useQuery(
    undefined,
    { enabled: open },
  )

  // Per-row opt-out. Defaults to every row checked. When a suggestion is
  // "rejected" (unchecked) it stays in the list but won't be applied.
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  const bulkSet = trpc.transactions.bulkSetType.useMutation({
    onSuccess: ({ updated }) => {
      utils.transactions.list.invalidate()
      utils.transactions.reclassifySuggestions.invalidate()
      toast.success(
        t("reclassify.applied", {
          count: updated,
          defaultValue_one: "Reclassified {count} transaction.",
          defaultValue_other: "Reclassified {count} transactions.",
        }),
      )
    },
    onError: (err) => toast.error(err.message),
  })

  const groups = useMemo(() => {
    const by = new Map<ProposedType, Suggestion[]>()
    for (const s of suggestions as Suggestion[]) {
      const bucket = by.get(s.suggestedType) ?? []
      bucket.push(s)
      by.set(s.suggestedType, bucket)
    }
    return GROUP_ORDER.map((k) => ({
      type: k,
      rows: by.get(k) ?? [],
    })).filter((g) => g.rows.length > 0)
  }, [suggestions])

  function toggleRow(id: string): void {
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applyGroup(group: { type: ProposedType; rows: Suggestion[] }): void {
    const ids = group.rows.map((r) => r.id).filter((id) => !rejected.has(id))
    if (ids.length === 0) return
    bulkSet.mutate({ ids, type: group.type })
  }

  function applyAll(): void {
    for (const group of groups) {
      const ids = group.rows.map((r) => r.id).filter((id) => !rejected.has(id))
      if (ids.length === 0) continue
      bulkSet.mutate({ ids, type: group.type })
    }
  }

  const totalProposed = suggestions.length
  const totalSelected = totalProposed - rejected.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("reclassify.title", { defaultValue: "Reclassify transaction types" })}
          </DialogTitle>
          <DialogDescription>
            {t("reclassify.subtitle", {
              defaultValue:
                "Heuristic scan over your transactions — description, merchant, and amount sign — suggesting better types where the current one looks off. Review per-row or apply the whole group.",
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Sparkles className="h-6 w-6" aria-hidden />
            <p className="text-sm">
              {t("reclassify.empty", {
                defaultValue: "Nothing to suggest — every transaction's type looks plausible.",
              })}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b pb-2 text-sm">
              <span className="text-muted-foreground">
                {t("reclassify.summary", {
                  selected: totalSelected,
                  total: totalProposed,
                  defaultValue: "{selected} of {total} selected",
                })}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={applyAll}
                disabled={bulkSet.isPending || totalSelected === 0}
              >
                {t("reclassify.applyAll", { defaultValue: "Apply all" })}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {groups.map((group) => {
                const selected = group.rows.filter((r) => !rejected.has(r.id)).length
                return (
                  <section key={group.type} className="mb-4 rounded-md border">
                    <header className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("border-transparent text-[11px]", TYPE_CHIP[group.type])}
                        >
                          → {t(`types.${group.type}`, { defaultValue: group.type })}
                        </Badge>
                        <span className="text-sm font-medium">
                          {t("reclassify.groupCount", {
                            selected,
                            total: group.rows.length,
                            defaultValue: "{selected} / {total}",
                          })}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyGroup(group)}
                        disabled={bulkSet.isPending || selected === 0}
                      >
                        {t("reclassify.applyGroup", {
                          defaultValue: "Apply group",
                        })}
                      </Button>
                    </header>
                    <ul className="divide-y">
                      {group.rows.map((row) => {
                        const isChecked = !rejected.has(row.id)
                        return (
                          <li
                            key={row.id}
                            className="flex items-start gap-3 px-3 py-2 text-sm"
                          >
                            <Checkbox
                              id={`reclassify-${row.id}`}
                              checked={isChecked}
                              onCheckedChange={() => toggleRow(row.id)}
                              className="mt-0.5"
                            />
                            <label
                              htmlFor={`reclassify-${row.id}`}
                              className="min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="truncate font-medium">
                                {row.name || row.merchant || row.description || row.id.slice(0, 8)}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {row.issuedAt ? format(row.issuedAt, "yyyy-MM-dd") : "—"}
                                {row.currentType && (
                                  <>
                                    {" · "}
                                    {t("reclassify.from", { defaultValue: "from" })}{" "}
                                    <span className="font-medium">
                                      {t(`types.${row.currentType}`, { defaultValue: row.currentType })}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                <span className="italic">{row.reason}</span>
                              </div>
                            </label>
                            <div className="shrink-0 text-right text-xs">
                              {row.total !== null && row.currencyCode
                                ? formatCurrency(Math.abs(row.total), row.currencyCode)
                                : "—"}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
