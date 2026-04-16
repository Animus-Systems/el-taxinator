import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Briefcase, Plus, Upload, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AddEmployerDialog } from "./add-employer-dialog"
import { PayslipUploadDialog } from "./payslip-upload-dialog"

export function EmploymentPage() {
  const { t } = useTranslation("tax")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const year = new Date().getFullYear()

  const { data: employers = [], isLoading } = trpc.incomeSources.list.useQuery({ kind: "salary" })
  const { data: totals = [] } = trpc.incomeSources.totals.useQuery({ year })

  const [addOpen, setAddOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  const totalsById = new Map(totals.map((t) => [t.sourceId, t]))

  const remove = trpc.incomeSources.delete.useMutation({
    onSuccess: () => {
      utils.incomeSources.list.invalidate()
      utils.incomeSources.totals.invalidate()
    },
  })

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("personal.employment.confirmDeleteTitle"),
      description: t("personal.employment.confirmDeleteBody", { name }),
      confirmLabel: t("personal.employment.delete"),
      variant: "destructive",
    })
    if (ok) remove.mutate({ id })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Briefcase className="h-6 w-6" />
            {t("personal.employment.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("personal.employment.pageSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("personal.employment.addEmployer")}
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            {t("personal.employment.uploadPayslip")}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("personal.loading")}</p>
      ) : employers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm">{t("personal.employment.emptyHint")}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                {t("personal.employment.addEmployer")}
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                {t("personal.employment.uploadPayslip")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {employers.map((emp) => {
            const totals = totalsById.get(emp.id)
            return (
              <li key={emp.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{emp.name}</span>
                        {emp.taxId && (
                          <Badge variant="outline" className="text-[10px]">
                            {emp.taxId}
                          </Badge>
                        )}
                        {!emp.isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("personal.employment.inactive")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {totals
                          ? t("personal.employment.ytdSummary", {
                              gross: formatCurrency(totals.grossCents, "EUR"),
                              withheld: formatCurrency(totals.withheldCents, "EUR"),
                            })
                          : t("personal.employment.noPayslipsYet")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(emp.id, emp.name)}
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

      <AddEmployerDialog open={addOpen} onOpenChange={setAddOpen} />
      <PayslipUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
