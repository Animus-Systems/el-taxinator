import { CasillaTable, type CasillaGroup, type CasillaRow } from "@/components/tax/casilla-table"
import { FilingChecklist, type ChecklistItem } from "@/components/tax/filing-checklist"
import { ModeloHero } from "@/components/tax/modelo-hero"
import type { TaxFiling } from "@/lib/db-types"
import type { EntityType } from "@/lib/entities"
import type { Modelo425Result } from "@/models/tax"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"

type Props = {
  modelo425: Modelo425Result
  entityType: EntityType
}

const ATC_PORTAL_URL = "https://sede.gobiernodecanarias.org/tributos/"

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

const QUARTER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Q1 (Ene\u2013Mar)",
  2: "Q2 (Abr\u2013Jun)",
  3: "Q3 (Jul\u2013Sep)",
  4: "Q4 (Oct\u2013Dic)",
}

function exportCSV425(m: Modelo425Result): void {
  const rows = [
    ["Trimestre", "Base 7%", "Cuota 7%", "Base 3%", "Cuota 3%", "IGIC devengado", "IGIC deducible", "Resultado"],
    ...m.quarters.map((q) => [
      `T${q.quarter}`,
      (q.baseGeneral / 100).toFixed(2),
      (q.cuotaGeneral / 100).toFixed(2),
      (q.baseReducido / 100).toFixed(2),
      (q.cuotaReducido / 100).toFixed(2),
      (q.totalIgicDevengado / 100).toFixed(2),
      (q.cuotaDeducible / 100).toFixed(2),
      (q.resultado / 100).toFixed(2),
    ]),
    [
      "TOTAL",
      (m.totalBaseGeneral / 100).toFixed(2),
      (m.totalCuotaGeneral / 100).toFixed(2),
      (m.totalBaseReducido / 100).toFixed(2),
      (m.totalCuotaReducido / 100).toFixed(2),
      (m.totalIgicDevengado / 100).toFixed(2),
      (m.totalIgicDeducible / 100).toFixed(2),
      (m.totalResultado / 100).toFixed(2),
    ],
  ]
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-425-${m.year}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AnualReport({ modelo425, entityType }: Props) {
  const t = useTranslations("tax")
  const { year } = modelo425
  const { data: filingList } = trpc.taxFilings.list.useQuery({ year })

  const filing425 = findFiling(filingList, year, null, "425")

  const deadline = new Date(year + 1, 0, 30)

  const groups: CasillaGroup[] = modelo425.quarters.map((q) => {
    const label = QUARTER_LABELS[q.quarter]
    const rows: CasillaRow[] = [
      {
        casilla: `Q${q.quarter}`,
        label: t("igicDevengado"),
        amountCents: q.totalIgicDevengado,
      },
      {
        casilla: `Q${q.quarter}`,
        label: t("igicDeducible"),
        amountCents: q.cuotaDeducible,
      },
      {
        casilla: `Q${q.quarter}`,
        label: t("result"),
        amountCents: q.resultado,
        highlight: q.resultado > 0 ? "positive" : q.resultado < 0 ? "negative" : "neutral",
      },
    ]
    return { heading: label, rows }
  })

  const resultRow: CasillaRow = {
    casilla: "",
    label: t("result"),
    amountCents: modelo425.totalResultado,
    highlight:
      modelo425.totalResultado > 0
        ? "positive"
        : modelo425.totalResultado < 0
          ? "negative"
          : "neutral",
  }

  const checklistItems: ChecklistItem[] = [
    { key: "verifyEstimates", label: t("checklist.verifyEstimates") },
    { key: "exportCsv", label: t("checklist.exportCsv") },
    {
      key: "fileOnPortal",
      label: t("checklist.fileOnPortal", { agency: t("agency.atc") }),
      href: ATC_PORTAL_URL,
    },
    {
      key: "payToAgency",
      label: t("checklist.payToAgency", { agency: t("agency.atc") }),
    },
  ]

  const subtitle = `${year} · ${t("annualSummary")}`

  return (
    <div className="space-y-8">
      <ModeloHero
        modeloCode="425"
        title={`Modelo 425 — ${t("annualSummary")} ${year}`}
        subtitle={subtitle}
        deadline={deadline}
        agency="atc"
        amountCents={modelo425.totalResultado}
        positiveLabel={t("hero.toPayAmount")}
        negativeLabel={t("hero.toReturnAmount")}
        zeroLabel={t("hero.nothingToPay")}
        filing={filing425}
        year={year}
        quarter={null}
        entityType={entityType}
        onExportCsv={() => exportCSV425(modelo425)}
        portalUrl={ATC_PORTAL_URL}
        knowledgeSlug="filing-modelo-425"
      />
      <CasillaTable groups={groups} resultRow={resultRow} />
      <FilingChecklist
        year={year}
        quarter={null}
        modeloCode="425"
        filing={filing425}
        items={checklistItems}
      />
    </div>
  )
}
