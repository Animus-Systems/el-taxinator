import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { HandCoins, Plus, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AddDeductionDialog } from "./add-deduction-dialog"

export function DeductionsPage() {
  const { t } = useTranslation("tax")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const taxYear = new Date().getFullYear()

  const { data: deductions = [], isLoading } = trpc.deductions.list.useQuery({ taxYear })
  const { data: totals } = trpc.deductions.totalsForYear.useQuery({ taxYear })

  const [addOpen, setAddOpen] = useState(false)

  const remove = trpc.deductions.delete.useMutation({
    onSuccess: () => {
      utils.deductions.list.invalidate()
      utils.deductions.totalsForYear.invalidate()
    },
  })

  const handleDelete = async (id: string, kind: string) => {
    const ok = await confirm({
      title: t("personal.deductions.confirmDeleteTitle"),
      description: t("personal.deductions.confirmDeleteBody", { kind: t(`personal.deductions.kind.${kind}`, { defaultValue: kind }) }),
      confirmLabel: t("personal.deductions.delete"),
      variant: "destructive",
    })
    if (ok) remove.mutate({ id })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HandCoins className="h-6 w-6" />
            {t("personal.deductions.title")} {taxYear}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("personal.deductions.pageSubtitle")}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("personal.deductions.addDeduction")}
        </Button>
      </header>

      {totals && (totals.baseReductionCents > 0 || totals.cuotaCreditCents > 0) && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("personal.deductions.baseReduction")}</p>
              <p className="text-lg font-semibold">
                {formatCurrency(totals.baseReductionCents, "EUR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("personal.deductions.cuotaCredit")}</p>
              <p className="text-lg font-semibold">
                {formatCurrency(totals.cuotaCreditCents, "EUR")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("personal.loading")}</p>
      ) : deductions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <HandCoins className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm">{t("personal.deductions.emptyHint")}</p>
            <Button onClick={() => setAddOpen(true)}>
              {t("personal.deductions.addDeduction")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {deductions.map((d) => (
            <li key={d.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <HandCoins className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {t(`personal.deductions.kind.${d.kind}`, { defaultValue: d.kind })}
                      </Badge>
                      <span className="font-medium">
                        {formatCurrency(d.amountCents, "EUR")}
                      </span>
                    </div>
                    {d.description && (
                      <p className="text-xs text-muted-foreground">{d.description}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(d.id, d.kind)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddDeductionDialog open={addOpen} onOpenChange={setAddOpen} taxYear={taxYear} />
    </div>
  )
}
