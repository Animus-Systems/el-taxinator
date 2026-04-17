import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Modelo202Result } from "@/models/tax-sl"
import type { Modelo420Result, Quarter } from "@/models/tax"
import { format } from "date-fns"
import { Download } from "lucide-react"
import { useTranslations } from "next-intl"

type Props = {
  modelo420: Modelo420Result
  modelo202: Modelo202Result
  year: number
  quarter: Quarter
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function Row({
  casilla,
  label,
  value,
  highlight,
}: {
  casilla: string
  label: string
  value: number
  highlight?: "positive" | "negative" | "neutral"
}) {
  const colorClass =
    highlight === "positive"
      ? "text-red-600 font-semibold"
      : highlight === "negative"
        ? "text-green-600 font-semibold"
        : ""

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-mono w-8 text-right">{casilla}</span>
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={colorClass}>{formatEUR(value)}</span>
    </div>
  )
}

function exportCSV420(m: Modelo420Result) {
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
  const csv = rows.map((row) => row.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `modelo-420-${m.year}-Q${m.quarter}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportCSV202(m: Modelo202Result) {
  const rows = [
    ["Casilla", "Descripcion", "Importe (EUR)"],
    ["01", "Base imponible", (m.casilla01_baseImponible / 100).toFixed(2)],
    ["02", "Tipo de gravamen (%)", m.casilla02_tipoGravamen.toFixed(2)],
    ["03", "Cuota integra", (m.casilla03_cuotaIntegra / 100).toFixed(2)],
    ["04", "Pagos a cuenta previos", (m.casilla04_pagosACuenta / 100).toFixed(2)],
    ["05", "A ingresar", (m.casilla05_aIngresar / 100).toFixed(2)],
  ]
  const csv = rows.map((row) => row.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `modelo-202-${m.year}-Q${m.quarter}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function QuarterlyCorporateReport({ modelo420, modelo202, year, quarter }: Props) {
  const t = useTranslations("tax")
  const igicOwed = modelo420.resultado >= 0
  const corporateTaxOwed = modelo202.casilla05_aIngresar > 0

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        {t("exerciseQuarter", { year, quarter })}{" "}
        {t("modelo202Cumulative")} {t("modelo420Quarterly")}
      </p>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("igicQuarterlyDeclaration")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV420(modelo420)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(modelo420.period.start, "dd/MM/yyyy")} – {format(modelo420.period.end, "dd/MM/yyyy")} &middot;{" "}
            {modelo420.invoiceCount} {t("invoices")} &middot; {modelo420.expenseCount} {t("expenses")}
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1">{t("igicCharged")}</p>
            {modelo420.baseZero > 0 && <Row casilla="" label={t("baseZeroRate")} value={modelo420.baseZero} />}
            {modelo420.baseReducido > 0 && (
              <>
                <Row casilla="" label={t("baseReducedRate")} value={modelo420.baseReducido} />
                <Row casilla="" label={t("igicReduced")} value={modelo420.cuotaReducido} />
              </>
            )}
            <Row casilla="" label={t("baseGeneralRate")} value={modelo420.baseGeneral} />
            <Row casilla="" label={t("igicGeneral")} value={modelo420.cuotaGeneral} />
            {modelo420.baseIncrementado > 0 && (
              <>
                <Row casilla="" label={t("baseIncreasedRate")} value={modelo420.baseIncrementado} />
                <Row casilla="" label={t("igicIncreased")} value={modelo420.cuotaIncrementado} />
              </>
            )}
            {modelo420.baseEspecial > 0 && (
              <>
                <Row casilla="" label={t("baseSpecialRate")} value={modelo420.baseEspecial} />
                <Row casilla="" label={t("igicSpecial")} value={modelo420.cuotaEspecial} />
              </>
            )}
            <Row casilla="" label={t("totalIgicChargedLabel")} value={modelo420.totalIgicDevengado} />
          </div>
          <div className="py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1">
              {t("igicDeductibleExpenses")}
            </p>
            <Row casilla="" label={t("deductibleBase")} value={modelo420.baseDeducible} />
            <Row casilla="" label={t("deductibleAmount")} value={modelo420.cuotaDeducible} />
            <p className="text-xs text-amber-600 mt-1">{t("igicEstimateWarning")}</p>
          </div>
          <div className="pt-2">
            <Row
              casilla=""
              label={t("result")}
              value={modelo420.resultado}
              highlight={igicOwed ? "positive" : "negative"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {igicOwed ? t("amountToPayATC") : t("amountToCompensate")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("corporateQuarterlyPayment")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV202(modelo202)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("cumulativeDataFrom")} {format(modelo202.period.end, "dd/MM/yyyy")} &middot;{" "}
            {modelo202.invoiceCount} {t("invoices")} &middot; {modelo202.expenseCount} {t("expenses")}
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-2">
            <Row casilla="01" label={t("taxableBase")} value={modelo202.casilla01_baseImponible} />
            <div className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-mono w-8 text-right">02</span>
                <span className="text-muted-foreground">{t("corporateRate")}</span>
              </div>
              <span>{modelo202.casilla02_tipoGravamen}%</span>
            </div>
            <Row
              casilla="03"
              label={t("corporateTaxQuota")}
              value={modelo202.casilla03_cuotaIntegra}
            />
            <Row
              casilla="04"
              label={t("paymentsOnAccount")}
              value={modelo202.casilla04_pagosACuenta}
            />
          </div>
          <div className="pt-2">
            <Row
              casilla="05"
              label={t("amountToPay")}
              value={modelo202.casilla05_aIngresar}
              highlight={corporateTaxOwed ? "positive" : "neutral"}
            />
            {!corporateTaxOwed && (
              <p className="text-xs text-muted-foreground mt-1">{t("corporateNoPaymentDue")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
        <p className="font-medium">{t("legalDisclaimer")}</p>
        <p>{t("corporateLegalDisclaimerText")}</p>
      </div>
    </div>
  )
}
