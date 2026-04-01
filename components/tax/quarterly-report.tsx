"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Modelo130Result, Modelo420Result, Quarter } from "@/models/tax"
import { format } from "date-fns"
import { Download } from "lucide-react"
import { useTranslations } from "next-intl"

type Props = {
  modelo420: Modelo420Result
  modelo130: Modelo130Result
  year: number
  quarter: Quarter
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function Row({ casilla, label, value, highlight }: { casilla: string; label: string; value: number; highlight?: "positive" | "negative" | "neutral" }) {
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
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-420-${m.year}-Q${m.quarter}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportCSV130(m: Modelo130Result) {
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

export function QuarterlyReport({ modelo420, modelo130, year, quarter }: Props) {
  const t = useTranslations("tax")
  const igicOwed = modelo420.resultado >= 0
  const irpfOwed = modelo130.casilla06_aIngresar > 0

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        {t("exerciseQuarter", { year, quarter })}{" "}
        {t("modelo130Cumulative")} {t("modelo420Quarterly")}
      </p>

      {/* Modelo 420 — IGIC */}
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
            {modelo420.baseZero > 0 && (
              <Row casilla="" label={t("baseZeroRate")} value={modelo420.baseZero} />
            )}
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

      {/* Modelo 130 — IRPF */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("irpfQuarterlyPayment")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV130(modelo130)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("cumulativeDataFrom")} {format(modelo130.period.end, "dd/MM/yyyy")} &middot;{" "}
            {modelo130.invoiceCount} {t("invoices")} &middot; {modelo130.expenseCount} {t("expenses")}
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-2">
            <Row casilla="01" label={t("periodIncome")} value={modelo130.casilla01_ingresos} />
            <Row casilla="02" label={t("periodExpenses")} value={modelo130.casilla02_gastos} />
            <Row casilla="03" label={t("netIncome")} value={modelo130.casilla03_rendimientoNeto} />
          </div>
          <div className="py-2">
            <Row casilla="04" label={t("irpfQuota")} value={modelo130.casilla04_cuota20pct} />
            <Row casilla="05" label={t("irpfWithheldByClients")} value={modelo130.casilla05_irpfRetenido} />
          </div>
          <div className="pt-2">
            <Row
              casilla="06"
              label={t("amountToPay")}
              value={modelo130.casilla06_aIngresar}
              highlight={irpfOwed ? "positive" : "neutral"}
            />
            {!irpfOwed && (
              <p className="text-xs text-muted-foreground mt-1">{t("witholdingsCoverPayment")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
        <p className="font-medium">{t("legalDisclaimer")}</p>
        <p>{t("legalDisclaimerText")}</p>
      </div>
    </div>
  )
}
