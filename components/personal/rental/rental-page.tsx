import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Home, Plus, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AddRentalDialog } from "./add-rental-dialog"

export function RentalPage() {
  const { t } = useTranslation("tax")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const year = new Date().getFullYear()

  const { data: properties = [], isLoading } = trpc.incomeSources.list.useQuery({ kind: "rental" })
  const { data: totals = [] } = trpc.incomeSources.totals.useQuery({ year })
  const totalsById = new Map(totals.map((t) => [t.sourceId, t]))

  const [addOpen, setAddOpen] = useState(false)

  const remove = trpc.incomeSources.delete.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
    },
  })

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("personal.rental.confirmDeleteTitle"),
      description: t("personal.rental.confirmDeleteBody", { name }),
      confirmLabel: t("personal.rental.delete"),
      variant: "destructive",
    })
    if (ok) remove.mutate({ id })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Home className="h-6 w-6" />
            {t("personal.rental.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("personal.rental.pageSubtitle")}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("personal.rental.addProperty")}
        </Button>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("personal.loading")}</p>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Home className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm">{t("personal.rental.emptyHint")}</p>
            <Button onClick={() => setAddOpen(true)}>
              {t("personal.rental.addProperty")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {properties.map((prop) => {
            const totals = totalsById.get(prop.id)
            const meta = prop.metadata as { address?: string; rentalType?: string }
            return (
              <li key={prop.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Home className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{prop.name}</span>
                        {meta.rentalType && (
                          <Badge variant="outline" className="text-[10px]">
                            {t(`personal.rental.type.${meta.rentalType}`, { defaultValue: meta.rentalType })}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {meta.address ?? "—"}
                        {totals
                          ? ` · ${t("personal.rental.ytdSummary", {
                              amount: formatCurrency(totals.grossCents, "EUR"),
                            })}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(prop.id, prop.name)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <AddRentalDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
