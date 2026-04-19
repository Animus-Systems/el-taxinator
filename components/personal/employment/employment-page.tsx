import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Briefcase, ChevronDown, ChevronRight, Plus, Upload, Trash2 } from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AddEmployerDialog } from "./add-employer-dialog"
import { PayslipUploadDialog } from "./payslip-upload-dialog"
import { EmployerDetailPanel } from "./employer-detail-panel"

export function EmploymentPage() {
  const { t } = useTranslation("tax")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [userPickedYear, setUserPickedYear] = useState(false)

  const { data: availableYears = [] } = trpc.incomeSources.availableYears.useQuery({ kind: "salary" })

  // One-shot auto-correct: if the user hasn't picked a year manually and the
  // current default is empty, jump to the latest year that actually has
  // salary-linked transactions. Rescues users whose salary rows were imported
  // for a previous tax year.
  useEffect(() => {
    if (userPickedYear) return
    if (availableYears.length === 0) return
    if (availableYears.includes(year)) return
    const latestWithData = availableYears[0]
    if (typeof latestWithData === "number") setYear(latestWithData)
  }, [availableYears, year, userPickedYear])

  const { data: employers = [], isLoading } = trpc.incomeSources.list.useQuery({ kind: "salary" })
  const { data: totals = [] } = trpc.incomeSources.totals.useQuery({ year })

  const yearOptions = (() => {
    const now = new Date().getFullYear()
    const set = new Set<number>([now, now - 1, now - 2, now - 3, ...availableYears])
    return [...set].sort((a, b) => b - a).slice(0, 6)
  })()

  const [addOpen, setAddOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-muted/60 p-0.5 text-[11px] flex-shrink-0">
            {yearOptions.map((y) => {
              const hasData = availableYears.includes(y)
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setUserPickedYear(true)
                    setYear(y)
                  }}
                  title={hasData ? undefined : t("personal.employment.yearNoDataHint")}
                  className={[
                    "px-3 py-1 rounded-md transition-colors tabular-nums",
                    y === year
                      ? "bg-background shadow-sm text-foreground font-medium"
                      : hasData
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50 hover:text-muted-foreground",
                  ].join(" ")}
                >
                  {y}
                  {hasData && y !== year ? (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />
                  ) : null}
                </button>
              )
            })}
          </div>
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
            const isExpanded = expandedId === emp.id
            return (
              <li key={emp.id}>
                <Card className="overflow-hidden">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setExpandedId(isExpanded ? null : emp.id)
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(emp.id, emp.name)
                      }}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {isExpanded ? <EmployerDetailPanel sourceId={emp.id} year={year} /> : null}
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
