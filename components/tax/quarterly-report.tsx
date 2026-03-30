"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Modelo130Result, Modelo303Result, Quarter } from "@/models/tax"
import { Download } from "lucide-react"

type Props = {
  modelo303: Modelo303Result
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

function exportCSV303(m: Modelo303Result) {
  const rows = [
    ["Casilla", "Descripción", "Importe (€)"],
    ["01", "Base imponible tipo general (21%)", (m.casilla01_baseGeneral / 100).toFixed(2)],
    ["03", "Cuota IVA tipo general", (m.casilla03_cuotaGeneral / 100).toFixed(2)],
    ["06", "Base imponible tipo reducido (10%)", (m.casilla06_baseReducido / 100).toFixed(2)],
    ["07", "Cuota IVA tipo reducido", (m.casilla07_cuotaReducido / 100).toFixed(2)],
    ["09", "Base imponible tipo superreducido (4%)", (m.casilla09_baseSuperReducido / 100).toFixed(2)],
    ["11", "Cuota IVA tipo superreducido", (m.casilla11_cuotaSuperReducido / 100).toFixed(2)],
    ["", "Total IVA repercutido", (m.totalIvaRepercutido / 100).toFixed(2)],
    ["28", "Base IVA deducible (estimada)", (m.casilla28_baseDeducible / 100).toFixed(2)],
    ["29", "Cuota IVA deducible (estimada)", (m.casilla29_cuotaDeducible / 100).toFixed(2)],
    ["46", "Resultado (a pagar / a devolver)", (m.casilla46_resultado / 100).toFixed(2)],
  ]
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-303-${m.year}-Q${m.quarter}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportCSV130(m: Modelo130Result) {
  const rows = [
    ["Casilla", "Descripción", "Importe (€)"],
    ["01", "Ingresos del período (acumulado)", (m.casilla01_ingresos / 100).toFixed(2)],
    ["02", "Gastos del período (acumulado)", (m.casilla02_gastos / 100).toFixed(2)],
    ["03", "Rendimiento neto", (m.casilla03_rendimientoNeto / 100).toFixed(2)],
    ["04", "Cuota (20% × rendimiento)", (m.casilla04_cuota20pct / 100).toFixed(2)],
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

export function QuarterlyReport({ modelo303, modelo130, year, quarter }: Props) {
  const vatOwed = modelo303.casilla46_resultado >= 0
  const irpfOwed = modelo130.casilla06_aIngresar > 0

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Los importes del Modelo 130 son acumulativos desde el 1 de enero hasta el fin del trimestre, según las instrucciones de la Agencia Tributaria.
        Los importes del Modelo 303 corresponden únicamente al trimestre seleccionado.
      </p>

      {/* Modelo 303 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelo 303 — Declaración trimestral IVA</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV303(modelo303)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {modelo303.period.start.toLocaleDateString("es-ES")} – {modelo303.period.end.toLocaleDateString("es-ES")} ·{" "}
            {modelo303.invoiceCount} facturas · {modelo303.expenseCount} gastos
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1">IVA repercutido (ventas)</p>
            <Row casilla="01" label="Base imponible al 21%" value={modelo303.casilla01_baseGeneral} />
            <Row casilla="03" label="Cuota IVA al 21%" value={modelo303.casilla03_cuotaGeneral} />
            {modelo303.casilla06_baseReducido > 0 && (
              <>
                <Row casilla="06" label="Base imponible al 10%" value={modelo303.casilla06_baseReducido} />
                <Row casilla="07" label="Cuota IVA al 10%" value={modelo303.casilla07_cuotaReducido} />
              </>
            )}
            {modelo303.casilla09_baseSuperReducido > 0 && (
              <>
                <Row casilla="09" label="Base imponible al 4%" value={modelo303.casilla09_baseSuperReducido} />
                <Row casilla="11" label="Cuota IVA al 4%" value={modelo303.casilla11_cuotaSuperReducido} />
              </>
            )}
            <Row casilla="" label="Total IVA repercutido" value={modelo303.totalIvaRepercutido} />
          </div>
          <div className="py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1">
              IVA deducible (gastos) — estimado
            </p>
            <Row casilla="28" label="Base IVA deducible (estimada)" value={modelo303.casilla28_baseDeducible} />
            <Row casilla="29" label="Cuota IVA deducible (estimada)" value={modelo303.casilla29_cuotaDeducible} />
            <p className="text-xs text-amber-600 mt-1">
              * El IVA soportado se estima al 21% incluido sobre los gastos. Verifica el IVA real de tus facturas de proveedor.
            </p>
          </div>
          <div className="pt-2">
            <Row
              casilla="46"
              label="Resultado"
              value={modelo303.casilla46_resultado}
              highlight={vatOwed ? "positive" : "negative"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {vatOwed ? "Cantidad a ingresar a la Agencia Tributaria" : "Cantidad a devolver / compensar"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Modelo 130 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelo 130 — Pago fraccionado IRPF (autónomos)</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV130(modelo130)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Datos acumulados del 1 Jan al {modelo130.period.end.toLocaleDateString("es-ES")} ·{" "}
            {modelo130.invoiceCount} facturas · {modelo130.expenseCount} gastos
          </p>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-2">
            <Row casilla="01" label="Ingresos del período (acumulado)" value={modelo130.casilla01_ingresos} />
            <Row casilla="02" label="Gastos del período (acumulado)" value={modelo130.casilla02_gastos} />
            <Row casilla="03" label="Rendimiento neto (01 − 02)" value={modelo130.casilla03_rendimientoNeto} />
          </div>
          <div className="py-2">
            <Row casilla="04" label="Cuota (20% × rendimiento neto)" value={modelo130.casilla04_cuota20pct} />
            <Row casilla="05" label="IRPF ya retenido por clientes" value={modelo130.casilla05_irpfRetenido} />
          </div>
          <div className="pt-2">
            <Row
              casilla="06"
              label="A ingresar"
              value={modelo130.casilla06_aIngresar}
              highlight={irpfOwed ? "positive" : "neutral"}
            />
            {!irpfOwed && (
              <p className="text-xs text-muted-foreground mt-1">
                Las retenciones cubren el pago fraccionado. No hay cantidad a ingresar.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
        <p className="font-medium">Aviso legal</p>
        <p>
          Estos datos son orientativos y se calculan automáticamente a partir de las facturas y gastos registrados.
          Verifica siempre los importes antes de presentar las declaraciones en la sede electrónica de la Agencia Tributaria.
          El IVA soportado en gastos se estima y puede diferir de la realidad.
        </p>
      </div>
    </div>
  )
}
