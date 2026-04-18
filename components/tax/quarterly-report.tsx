import { CasillaDrillSheet, type DrillSource } from "@/components/tax/casilla-drill-sheet"
import { CasillaTable, type CasillaGroup, type CasillaRow } from "@/components/tax/casilla-table"
import { FilingChecklist, type ChecklistItem } from "@/components/tax/filing-checklist"
import { ModeloHero } from "@/components/tax/modelo-hero"
import type { TaxFiling } from "@/lib/db-types"
import type { EntityType } from "@/lib/entities"
import type { Modelo130Result, Modelo420Result, Quarter } from "@/models/tax"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { trpc } from "~/trpc"

type Props = {
  modelo420: Modelo420Result
  modelo130: Modelo130Result
  year: number
  quarter: Quarter
  entityType: EntityType
}

const ATC_PORTAL_URL = "https://sede.gobiernodecanarias.org/tributos/"
const AEAT_PORTAL_URL = "https://sede.agenciatributaria.gob.es/"

function findFiling(
  list: TaxFiling[] | undefined,
  year: number,
  quarter: number | null,
  modelo: string,
): TaxFiling | null {
  return (
    list?.find((f) => f.year === year && f.quarter === quarter && f.modeloCode === modelo) ?? null
  )
}

function atcDeadline(periodEnd: Date): Date {
  return new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 20)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function exportCSV420(m: Modelo420Result): void {
  const rows = [
    ["Casilla", "Descripcion", "Importe (EUR)"],
    ["", "Base tipo cero (0%)", (m.baseZero / 100).toFixed(2)],
    ["", "Cuota tipo cero", (m.cuotaZero / 100).toFixed(2)],
    ["", "Base tipo reducido (3%)", (m.baseReducido / 100).toFixed(2)],
    ["", "Cuota IGIC reducido", (m.cuotaReducido / 100).toFixed(2)],
    ["", "Base tipo general (7%)", (m.baseGeneral / 100).toFixed(2)],
    ["", "Cuota IGIC general", (m.cuotaGeneral / 100).toFixed(2)],
    ["", "Base tipo incrementado (9.5%)", (m.baseIncrementado / 100).toFixed(2)],
    ["", "Cuota IGIC incrementado", (m.cuotaIncrementado / 100).toFixed(2)],
    ["", "Base tipo especial (15%+)", (m.baseEspecial / 100).toFixed(2)],
    ["", "Cuota IGIC especial", (m.cuotaEspecial / 100).toFixed(2)],
    ["", "Total IGIC devengado", (m.totalIgicDevengado / 100).toFixed(2)],
    ["", "Base IGIC deducible (estimada)", (m.baseDeducible / 100).toFixed(2)],
    ["", "Cuota IGIC deducible (estimada)", (m.cuotaDeducible / 100).toFixed(2)],
    ["", "Resultado", (m.resultado / 100).toFixed(2)],
  ]
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-420-${m.year}-Q${m.quarter}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportCSV130(m: Modelo130Result): void {
  const rows = [
    ["Casilla", "Descripcion", "Importe (EUR)"],
    ["01", "Ingresos del periodo (acumulado)", (m.casilla01_ingresos / 100).toFixed(2)],
    ["02", "Gastos del periodo (acumulado)", (m.casilla02_gastos / 100).toFixed(2)],
    ["03", "Rendimiento neto", (m.casilla03_rendimientoNeto / 100).toFixed(2)],
    ["04", "Cuota (20% x rendimiento)", (m.casilla04_cuota20pct / 100).toFixed(2)],
    ["05", "IRPF ya retenido por clientes", (m.casilla05_irpfRetenido / 100).toFixed(2)],
    ["06", "A ingresar", (m.casilla06_aIngresar / 100).toFixed(2)],
  ]
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-130-${m.year}-Q${m.quarter}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function QuarterlyReport({ modelo420, modelo130, year, quarter, entityType }: Props) {
  const t = useTranslations("tax")
  const { data: filingList } = trpc.taxFilings.list.useQuery({ year })

  const [drill, setDrill] = useState<{ key: string; source: DrillSource; title: string; casilla?: string } | null>(null)

  const filing420 = findFiling(filingList, year, quarter, "420")
  const filing130 = findFiling(filingList, year, quarter, "130")

  const period = modelo420.period
  const deadline = atcDeadline(period.end)
  const dateFromQuarter = isoDate(period.start)
  const dateTo = isoDate(period.end)
  const yearStart = isoDate(new Date(year, 0, 1))

  // ── Modelo 420 rows ──────────────────────────────────────────────────────
  const igicChargedRows: CasillaRow[] = []
  if (modelo420.baseZero > 0) {
    igicChargedRows.push({
      casilla: "",
      label: t("baseZeroRate"),
      amountCents: modelo420.baseZero,
      drillDownKey: "igic-zero",
    })
  }
  if (modelo420.baseReducido > 0) {
    igicChargedRows.push({
      casilla: "",
      label: t("baseReducedRate"),
      amountCents: modelo420.baseReducido,
      drillDownKey: "igic-reduced",
    })
    igicChargedRows.push({
      casilla: "",
      label: t("igicReduced"),
      amountCents: modelo420.cuotaReducido,
    })
  }
  igicChargedRows.push({
    casilla: "",
    label: t("baseGeneralRate"),
    amountCents: modelo420.baseGeneral,
    drillDownKey: "igic-general",
  })
  igicChargedRows.push({
    casilla: "",
    label: t("igicGeneral"),
    amountCents: modelo420.cuotaGeneral,
  })
  if (modelo420.baseIncrementado > 0) {
    igicChargedRows.push({
      casilla: "",
      label: t("baseIncreasedRate"),
      amountCents: modelo420.baseIncrementado,
      drillDownKey: "igic-increased",
    })
    igicChargedRows.push({
      casilla: "",
      label: t("igicIncreased"),
      amountCents: modelo420.cuotaIncrementado,
    })
  }
  if (modelo420.baseEspecial > 0) {
    igicChargedRows.push({
      casilla: "",
      label: t("baseSpecialRate"),
      amountCents: modelo420.baseEspecial,
      drillDownKey: "igic-special",
    })
    igicChargedRows.push({
      casilla: "",
      label: t("igicSpecial"),
      amountCents: modelo420.cuotaEspecial,
    })
  }
  igicChargedRows.push({
    casilla: "",
    label: t("totalIgicChargedLabel"),
    amountCents: modelo420.totalIgicDevengado,
  })

  const igicDeductibleRows: CasillaRow[] = [
    {
      casilla: "",
      label: t("deductibleBase"),
      amountCents: modelo420.baseDeducible,
      drillDownKey: "igic-deductible",
    },
    {
      casilla: "",
      label: t("deductibleAmount"),
      amountCents: modelo420.cuotaDeducible,
    },
  ]

  const groups420: CasillaGroup[] = [
    { heading: t("igicCharged"), rows: igicChargedRows },
    { heading: t("igicDeductibleExpenses"), rows: igicDeductibleRows },
  ]

  const resultRow420: CasillaRow = {
    casilla: "",
    label: t("result"),
    amountCents: modelo420.resultado,
    highlight: modelo420.resultado > 0 ? "positive" : "negative",
  }

  // ── Modelo 130 rows ──────────────────────────────────────────────────────
  const groups130: CasillaGroup[] = [
    {
      rows: [
        {
          casilla: "01",
          label: t("periodIncome"),
          amountCents: modelo130.casilla01_ingresos,
          drillDownKey: "income",
        },
        {
          casilla: "02",
          label: t("periodExpenses"),
          amountCents: modelo130.casilla02_gastos,
          drillDownKey: "expenses",
        },
        {
          casilla: "03",
          label: t("netIncome"),
          amountCents: modelo130.casilla03_rendimientoNeto,
        },
      ],
    },
    {
      rows: [
        {
          casilla: "04",
          label: t("irpfQuota"),
          amountCents: modelo130.casilla04_cuota20pct,
        },
        {
          casilla: "05",
          label: t("irpfWithheldByClients"),
          amountCents: modelo130.casilla05_irpfRetenido,
        },
      ],
    },
  ]

  const resultRow130: CasillaRow = {
    casilla: "06",
    label: t("amountToPay"),
    amountCents: modelo130.casilla06_aIngresar,
    highlight: modelo130.casilla06_aIngresar > 0 ? "positive" : "neutral",
  }

  // ── Drill-down source maps ───────────────────────────────────────────────
  const drill420Sources: Record<string, DrillSource> = {
    "igic-zero": {
      kind: "invoices",
      year,
      quarter,
      dateFrom: dateFromQuarter,
      dateTo,
      statuses: ["sent", "paid"],
    },
    "igic-reduced": {
      kind: "invoices",
      year,
      quarter,
      dateFrom: dateFromQuarter,
      dateTo,
      statuses: ["sent", "paid"],
    },
    "igic-general": {
      kind: "invoices",
      year,
      quarter,
      dateFrom: dateFromQuarter,
      dateTo,
      statuses: ["sent", "paid"],
    },
    "igic-increased": {
      kind: "invoices",
      year,
      quarter,
      dateFrom: dateFromQuarter,
      dateTo,
      statuses: ["sent", "paid"],
    },
    "igic-special": {
      kind: "invoices",
      year,
      quarter,
      dateFrom: dateFromQuarter,
      dateTo,
      statuses: ["sent", "paid"],
    },
    "igic-deductible": {
      kind: "transactions",
      dateFrom: dateFromQuarter,
      dateTo,
      type: "expense",
    },
  }

  const drill130Sources: Record<string, DrillSource> = {
    income: {
      kind: "invoices",
      year,
      quarter,
      dateFrom: yearStart,
      dateTo,
      statuses: ["sent", "paid"],
    },
    expenses: {
      kind: "transactions",
      dateFrom: yearStart,
      dateTo,
      type: "expense",
    },
  }

  const drill420Titles: Record<string, string> = {
    "igic-zero": t("baseZeroRate"),
    "igic-reduced": t("baseReducedRate"),
    "igic-general": t("baseGeneralRate"),
    "igic-increased": t("baseIncreasedRate"),
    "igic-special": t("baseSpecialRate"),
    "igic-deductible": t("deductibleBase"),
  }

  const drill130Titles: Record<string, string> = {
    income: t("periodIncome"),
    expenses: t("periodExpenses"),
  }

  function open420Drill(key: string): void {
    const source = drill420Sources[key]
    const title = drill420Titles[key]
    if (!source || !title) return
    setDrill({ key, source, title })
  }

  function open130Drill(key: string): void {
    const source = drill130Sources[key]
    const title = drill130Titles[key]
    if (!source || !title) return
    const casilla = key === "income" ? "01" : key === "expenses" ? "02" : undefined
    setDrill({ key, source, title, ...(casilla && { casilla }) })
  }

  const subtitle420 = `${format(period.start, "dd/MM/yyyy")} – ${format(period.end, "dd/MM/yyyy")} · ${modelo420.invoiceCount} ${t("invoices")} · ${modelo420.expenseCount} ${t("expenses")}`
  const subtitle130 = `${format(new Date(year, 0, 1), "dd/MM/yyyy")} – ${format(period.end, "dd/MM/yyyy")} · ${modelo130.invoiceCount} ${t("invoices")} · ${modelo130.expenseCount} ${t("expenses")}`

  const checklistItems = (agency: "aeat" | "atc", portalUrl: string): ChecklistItem[] => [
    { key: "verifyEstimates", label: t("checklist.verifyEstimates") },
    { key: "exportCsv", label: t("checklist.exportCsv") },
    {
      key: "fileOnPortal",
      label: t("checklist.fileOnPortal", {
        agency: t(agency === "aeat" ? "agency.aeat" : "agency.atc"),
      }),
      href: portalUrl,
    },
    {
      key: "payToAgency",
      label: t("checklist.payToAgency", {
        agency: t(agency === "aeat" ? "agency.aeat" : "agency.atc"),
      }),
    },
  ]

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <ModeloHero
          modeloCode="420"
          title={t("igicQuarterlyDeclaration")}
          subtitle={subtitle420}
          deadline={deadline}
          agency="atc"
          amountCents={modelo420.resultado}
          positiveLabel={t("hero.toPayAmount")}
          negativeLabel={t("hero.toReturnAmount")}
          zeroLabel={t("hero.nothingToPay")}
          filing={filing420}
          year={year}
          quarter={quarter}
          entityType={entityType}
          onExportCsv={() => exportCSV420(modelo420)}
          portalUrl={ATC_PORTAL_URL}
          knowledgeSlug="filing-modelo-420"
        />
        <CasillaTable
          groups={groups420}
          resultRow={resultRow420}
          onDrillDown={open420Drill}
          footer={<span className="text-amber-600 dark:text-amber-400">{t("igicEstimateWarning")}</span>}
        />
        <FilingChecklist
          year={year}
          quarter={quarter}
          modeloCode="420"
          filing={filing420}
          items={checklistItems("atc", ATC_PORTAL_URL)}
        />
      </section>

      <section className="space-y-4">
        <ModeloHero
          modeloCode="130"
          title={t("irpfQuarterlyPayment")}
          subtitle={subtitle130}
          deadline={deadline}
          agency="aeat"
          amountCents={modelo130.casilla06_aIngresar}
          positiveLabel={t("hero.toPayAmount")}
          negativeLabel={t("hero.toReturnAmount")}
          zeroLabel={t("hero.nothingToPay")}
          filing={filing130}
          year={year}
          quarter={quarter}
          entityType={entityType}
          onExportCsv={() => exportCSV130(modelo130)}
          portalUrl={AEAT_PORTAL_URL}
          knowledgeSlug="filing-modelo-130"
        />
        <CasillaTable
          groups={groups130}
          resultRow={resultRow130}
          onDrillDown={open130Drill}
          footer={
            modelo130.casilla06_aIngresar <= 0 ? t("witholdingsCoverPayment") : null
          }
        />
        <FilingChecklist
          year={year}
          quarter={quarter}
          modeloCode="130"
          filing={filing130}
          items={checklistItems("aeat", AEAT_PORTAL_URL)}
        />
      </section>

      <CasillaDrillSheet
        open={drill !== null}
        onOpenChange={(v) => {
          if (!v) setDrill(null)
        }}
        title={drill?.title ?? ""}
        {...(drill?.casilla && { casilla: drill.casilla })}
        source={
          drill?.source ?? {
            kind: "invoices",
            year,
            quarter,
            dateFrom: dateFromQuarter,
            dateTo,
            statuses: ["sent", "paid"],
          }
        }
      />
    </div>
  )
}
