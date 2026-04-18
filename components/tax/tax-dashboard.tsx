import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntityType } from "@/lib/entities"
import { Link, useRouter } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { trpc } from "~/trpc"
import { useTranslations } from "next-intl"
import { ChevronRight, FileText, Plus } from "lucide-react"
import { NextDeadlineHero } from "./next-deadline-hero"
import { QuarterTimeline, type QuarterTimelineStep } from "./quarter-timeline"
import { pickNextDeadline, quarterStatus, type QuarterStatus } from "./quarter-status"
import { RecordPastFilingDialog } from "./record-past-filing-dialog"

type SummaryItem = {
  quarter: number
  label: string
  deadline: Date
  forms: string[]
  modelo420: {
    totalIgicDevengado: number
    cuotaDeducible: number
    resultado: number
    invoiceCount: number
    expenseCount: number
  }
  modelo130?: {
    casilla01_ingresos: number
    casilla05_irpfRetenido: number
    casilla06_aIngresar: number
  }
  modelo202?: {
    casilla01_baseImponible: number
    casilla02_tipoGravamen: number
    casilla05_aIngresar: number
  }
}

type Deadline = {
  quarter: number
  label: string
  deadline: Date
  forms: string[]
}

type Props = {
  year: number
  summary: SummaryItem[]
  deadlines: Deadline[]
  entityType?: EntityType
}

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function StatusBadge({ status }: { status: QuarterStatus }) {
  const t = useTranslations("tax.timeline")
  if (status === "filed") return <Badge variant="outline" className="border-green-400 text-green-700 dark:text-green-400 text-[10px]">{t("filed")}</Badge>
  if (status === "overdue") return <Badge variant="destructive" className="text-[10px]">{t("overdue")}</Badge>
  if (status === "current") return <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]" variant="outline">{t("current")}</Badge>
  if (status === "upcoming") return <Badge variant="outline" className="text-[10px]">{t("upcoming")}</Badge>
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("future")}</Badge>
}

export function TaxDashboard({ year, summary, deadlines: _deadlines, entityType = "autonomo" }: Props) {
  const router = useRouter()
  const t = useTranslations("tax")
  const { data: filings } = trpc.taxFilings.list.useQuery({ year })
  const filingsList = filings ?? []
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)

  function changeYear(delta: number): void {
    router.push(`/tax?year=${year + delta}`)
  }

  const timelineSteps: QuarterTimelineStep[] = summary.map((item) => ({
    quarter: item.quarter,
    label: item.label.split(" ")[0] ?? `Q${item.quarter}`,
    status: quarterStatus({ year, quarter: item.quarter, deadline: item.deadline, filings: filingsList, entityType, now: new Date() }),
  }))

  const nextDeadline = pickNextDeadline(summary, filingsList, year, entityType)
  const nextSummary = nextDeadline ? summary.find((s) => s.quarter === nextDeadline.quarter) : null

  const yearTotals: Array<{ label: string; value: number }> = [
    { label: t("totalIgicDevengado"), value: summary.reduce((s, q) => s + q.modelo420.totalIgicDevengado, 0) },
    { label: t("totalIgicDeducible"), value: summary.reduce((s, q) => s + q.modelo420.cuotaDeducible, 0) },
    ...(entityType === "sl"
      ? [
          { label: t("taxableBase"), value: summary.reduce((s, q) => s + (q.modelo202?.casilla01_baseImponible ?? 0), 0) },
          { label: t("corporateTax"), value: summary.reduce((s, q) => s + (q.modelo202?.casilla05_aIngresar ?? 0), 0) },
        ]
      : [
          { label: t("totalIncome"), value: summary[summary.length - 1]?.modelo130?.casilla01_ingresos ?? 0 },
          { label: t("totalIrpfWithheld"), value: summary[summary.length - 1]?.modelo130?.casilla05_irpfRetenido ?? 0 },
        ]),
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => changeYear(-1)}>&larr;</Button>
          <span className="text-sm font-semibold tabular-nums px-1">{year}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => changeYear(1)}>&rarr;</Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {entityType === "sl" ? t("entitySL") : t("entityAutonomo")}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setRecordDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("recordPastFiling")}
          </Button>
          <Link href={`/tax/${year}`}>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              {t("modelo425")}
            </Button>
          </Link>
        </div>
      </div>

      <RecordPastFilingDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        entityType={entityType}
        defaultYear={year}
      />

      {nextDeadline && nextSummary ? (
        <NextDeadlineHero
          year={year}
          quarter={nextDeadline.quarter}
          label={nextSummary.label}
          deadline={nextSummary.deadline}
          forms={nextSummary.forms}
          modelo420={nextSummary.modelo420}
          {...(nextSummary.modelo130 && { modelo130: nextSummary.modelo130 })}
          {...(nextSummary.modelo202 && { modelo202: nextSummary.modelo202 })}
          entityType={entityType}
        />
      ) : null}

      <QuarterTimeline year={year} steps={timelineSteps} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summary.map((item) => {
          const status = quarterStatus({ year, quarter: item.quarter, deadline: item.deadline, filings: filingsList, entityType, now: new Date() })
          const igicResult = item.modelo420.resultado
          const secondaryAmount = entityType === "sl"
            ? item.modelo202?.casilla05_aIngresar ?? 0
            : item.modelo130?.casilla06_aIngresar ?? 0
          const secondaryLabel = entityType === "sl" ? t("corporateTax") : t("modelo130")

          const emphasized = status === "current" || status === "overdue"
          const muted = status === "filed"
          return (
            <Card
              key={item.quarter}
              className={cn(
                "transition-shadow",
                emphasized && "ring-2 ring-primary/15",
                muted && "bg-muted/30",
                "hover:shadow-sm",
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{item.label}</CardTitle>
                  <StatusBadge status={status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("deadline")}: {item.deadline.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 text-sm">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground">IGIC</span>
                  <span className="text-xs text-muted-foreground">{igicResult >= 0 ? t("toPay") : t("toReturn")}</span>
                  <span className={cn(
                    "tabular-nums font-semibold",
                    igicResult > 0 ? "text-red-600 dark:text-red-400" : igicResult < 0 ? "text-green-600 dark:text-green-400" : "text-foreground",
                  )}>
                    {formatEUR(Math.abs(igicResult))}
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 text-sm">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground">
                    {entityType === "sl" ? "IS" : "IRPF"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {secondaryAmount > 0 ? t("toPay") : t("noPayment")}
                    <span className="sr-only"> {secondaryLabel}</span>
                  </span>
                  <span className={cn(
                    "tabular-nums font-semibold",
                    secondaryAmount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  )}>
                    {secondaryAmount > 0 ? formatEUR(secondaryAmount) : "\u2014"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-xs text-muted-foreground">
                    {item.modelo420.invoiceCount} {t("invoices")} · {item.modelo420.expenseCount} {t("expenses")}
                  </span>
                  <Link href={`/tax/${year}/${item.quarter}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      {t("viewDetail")} <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="border-t pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("yearTotals")}</h4>
          <Link href={`/tax/${year}`}>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              {t("viewFullModelo")}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {yearTotals.map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
