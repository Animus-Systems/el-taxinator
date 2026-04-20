/**
 * Shows every invoice/purchase payment allocated against a transaction, with
 * per-row unlink and a deep-link into the owning document. Rendered below
 * the edit form on the transaction detail page.
 *
 * Direction coding mirrors the reconcile page so a user who has learned one
 * palette doesn't have to relearn another:
 *   - invoice (income side) → emerald accent
 *   - purchase (expense side) → rose accent
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Link } from "@/lib/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ExternalLink, FileText, Loader2, Receipt, Unlink } from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/ui/confirm-dialog"

type DocKind = "invoice" | "purchase"

const KIND_ACCENT: Record<DocKind, { bar: string; chip: string; icon: string }> = {
  invoice: {
    bar: "bg-emerald-500/70",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  purchase: {
    bar: "bg-rose-500/70",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    icon: "text-rose-600 dark:text-rose-400",
  },
}

export function TransactionAllocationsPanel({ transactionId }: { transactionId: string }) {
  const { t } = useTranslation("transactions")
  const confirm = useConfirm()
  const utils = trpc.useUtils()

  const { data: allocations = [], isLoading } =
    trpc.reconcile.allocationsForTransaction.useQuery({ transactionId })

  const unallocate = trpc.reconcile.unallocate.useMutation({
    onSuccess: () => {
      utils.reconcile.allocationsForTransaction.invalidate({ transactionId })
      utils.reconcile.data.invalidate()
      utils.invoices.list.invalidate()
      utils.purchases.list.invalidate()
      toast.success(
        t("allocations.unlinked", { defaultValue: "Allocation removed." }),
      )
    },
    onError: (err) => toast.error(err.message),
  })

  async function onUnlink(
    paymentId: string,
    documentKind: DocKind,
    documentNumber: string,
  ): Promise<void> {
    const ok = await confirm({
      title: t("allocations.unlinkConfirmTitle", {
        defaultValue: "Unlink allocation?",
      }),
      description: t("allocations.unlinkConfirmDesc", {
        number: documentNumber,
        defaultValue:
          "Remove the link between this transaction and {number}? The document keeps existing; only the allocation is deleted.",
      }),
      confirmLabel: t("allocations.unlink", { defaultValue: "Unlink" }),
      variant: "destructive",
    })
    if (!ok) return
    unallocate.mutate({ paymentId, documentKind })
  }

  if (isLoading) {
    return (
      <section className="rounded-md border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </section>
    )
  }

  if (allocations.length === 0) {
    return (
      <section className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        <p>
          {t("allocations.empty", {
            defaultValue:
              "No invoices or purchases linked to this transaction yet.",
          })}
        </p>
        <Button asChild variant="link" size="sm" className="mt-1">
          <Link href="/reconcile">
            {t("allocations.openReconcile", { defaultValue: "Open reconcile" })}
          </Link>
        </Button>
      </section>
    )
  }

  const totalAllocated = allocations.reduce((s, a) => s + a.amountCents, 0)
  const currency = allocations[0]?.documentCurrencyCode ?? "EUR"

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {t("allocations.heading", {
            count: allocations.length,
            defaultValue: "Linked documents ({count})",
          })}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("allocations.totalAllocated", {
            amount: formatCurrency(totalAllocated, currency),
            defaultValue: "{amount} allocated",
          })}
        </span>
      </div>
      <ul className="space-y-1.5">
        {allocations.map((a) => {
          const accent = KIND_ACCENT[a.documentKind]
          const Icon = a.documentKind === "invoice" ? FileText : Receipt
          const href =
            a.documentKind === "invoice"
              ? `/invoices/${a.documentId}`
              : `/purchases/${a.documentId}`
          return (
            <li
              key={a.paymentId}
              className="relative flex items-center gap-3 rounded-md border bg-background px-3 py-2 pl-4"
            >
              <div
                className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-md", accent.bar)}
                aria-hidden
              />
              <Icon className={cn("h-4 w-4 shrink-0", accent.icon)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={href}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {a.documentNumber}
                  </Link>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] border-transparent", accent.chip)}
                  >
                    {a.documentKind === "invoice"
                      ? t("allocations.invoiceShort", { defaultValue: "Invoice" })
                      : t("allocations.purchaseShort", { defaultValue: "Purchase" })}
                  </Badge>
                  {a.source === "ai" && (
                    <Badge variant="outline" className="text-[10px]">
                      AI
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.contactName ?? "—"} · {format(a.issueDate, "yyyy-MM-dd")}
                  {a.amountCents !== a.documentTotalCents && (
                    <>
                      {" · "}
                      {t("allocations.partialOf", {
                        total: formatCurrency(a.documentTotalCents, a.documentCurrencyCode),
                        defaultValue: "partial of {total}",
                      })}
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-medium">
                {formatCurrency(a.amountCents, a.documentCurrencyCode)}
              </div>
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={t("allocations.open", { defaultValue: "Open" })}
                title={t("allocations.open", { defaultValue: "Open" })}
              >
                <Link href={href}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("allocations.unlink", { defaultValue: "Unlink" })}
                title={t("allocations.unlink", { defaultValue: "Unlink" })}
                onClick={() => onUnlink(a.paymentId, a.documentKind, a.documentNumber)}
                disabled={unallocate.isPending}
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">
          {t("allocations.hint", {
            defaultValue:
              "Add or change allocations on the Reconcile page — drag invoices or purchases onto this transaction.",
          })}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/reconcile">
            {t("allocations.openReconcile", { defaultValue: "Open reconcile" })}
          </Link>
        </Button>
      </div>
    </section>
  )
}
