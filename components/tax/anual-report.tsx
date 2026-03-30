"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Modelo390Result } from "@/models/tax"
import { Download } from "lucide-react"
import Link from "next/link"

type Props = {
  modelo390: Modelo390Result
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function exportCSV390(m: Modelo390Result) {
  const rows = [
    ["Trimestre", "Base 21%", "Cuota 21%", "Base 10%", "Cuota 10%", "Base 4%", "Cuota 4%", "IVA repercutido", "IVA deducible", "Resultado"],
    ...m.quarters.map((q) => [
      `T${q.quarter}`,
      (q.casilla01_baseGeneral / 100).toFixed(2),
      (q.casilla03_cuotaGeneral / 100).toFixed(2),
      (q.casilla06_baseReducido / 100).toFixed(2),
      (q.casilla07_cuotaReducido / 100).toFixed(2),
      (q.casilla09_baseSuperReducido / 100).toFixed(2),
      (q.casilla11_cuotaSuperReducido / 100).toFixed(2),
      (q.totalIvaRepercutido / 100).toFixed(2),
      (q.casilla29_cuotaDeducible / 100).toFixed(2),
      (q.casilla46_resultado / 100).toFixed(2),
    ]),
    [
      "TOTAL",
      (m.totalBaseGeneral / 100).toFixed(2),
      (m.totalCuotaGeneral / 100).toFixed(2),
      (m.totalBaseReducido / 100).toFixed(2),
      (m.totalCuotaReducido / 100).toFixed(2),
      "",
      "",
      (m.totalIvaRepercutido / 100).toFixed(2),
      (m.totalIvaDeducible / 100).toFixed(2),
      (m.totalResultado / 100).toFixed(2),
    ],
  ]
  const csv = rows.map((r) => r.join(";")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `modelo-390-${m.year}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AnualReport({ modelo390 }: Props) {
  const quarterLabels = ["Q1 (Ene–Mar)", "Q2 (Abr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dic)"]

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelo 390 — Resumen Anual IVA {modelo390.year}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV390(modelo390)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary totals */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground">Total IVA repercutido</p>
              <p className="text-xl font-semibold">{formatEUR(modelo390.totalIvaRepercutido)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total IVA deducible</p>
              <p className="text-xl font-semibold">{formatEUR(modelo390.totalIvaDeducible)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resultado anual</p>
              <p className={`text-xl font-semibold ${modelo390.totalResultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                {formatEUR(Math.abs(modelo390.totalResultado))}
                <span className="text-xs ml-1">{modelo390.totalResultado >= 0 ? "(a pagar)" : "(a devolver)"}</span>
              </p>
            </div>
          </div>

          {/* Quarterly breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Trimestre</th>
                  <th className="text-right pb-2 font-medium">IVA repercutido</th>
                  <th className="text-right pb-2 font-medium">IVA deducible</th>
                  <th className="text-right pb-2 font-medium">Resultado</th>
                  <th className="text-right pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelo390.quarters.map((q, i) => (
                  <tr key={q.quarter}>
                    <td className="py-2 text-muted-foreground">{quarterLabels[i]}</td>
                    <td className="py-2 text-right">{formatEUR(q.totalIvaRepercutido)}</td>
                    <td className="py-2 text-right">{formatEUR(q.casilla29_cuotaDeducible)}</td>
                    <td className={`py-2 text-right font-medium ${q.casilla46_resultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatEUR(q.casilla46_resultado)}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/tax/${modelo390.year}/${q.quarter}`} className="text-xs text-primary hover:underline">
                        Detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">Total anual</td>
                  <td className="py-2 text-right">{formatEUR(modelo390.totalIvaRepercutido)}</td>
                  <td className="py-2 text-right">{formatEUR(modelo390.totalIvaDeducible)}</td>
                  <td className={`py-2 text-right ${modelo390.totalResultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatEUR(modelo390.totalResultado)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
        <p className="font-medium">Aviso legal</p>
        <p>
          El Modelo 390 es el resumen anual del IVA. Se presenta en enero del año siguiente junto con la declaración del Q4 (Modelo 303).
          Verifica todos los importes antes de presentar la declaración en la sede electrónica de la Agencia Tributaria.
        </p>
      </div>
    </div>
  )
}
