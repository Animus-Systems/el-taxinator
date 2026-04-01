"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Modelo425Result } from "@/models/tax"
import { Download } from "lucide-react"
import { Link } from "@/lib/navigation"

type Props = {
  modelo425: Modelo425Result
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function exportCSV425(m: Modelo425Result) {
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

export function AnualReport({ modelo425 }: Props) {
  const quarterLabels = ["Q1 (Ene\u2013Mar)", "Q2 (Abr\u2013Jun)", "Q3 (Jul\u2013Sep)", "Q4 (Oct\u2013Dic)"]

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Modelo 425 — Resumen Anual IGIC {modelo425.year}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportCSV425(modelo425)}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary totals */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground">Total IGIC devengado</p>
              <p className="text-xl font-semibold">{formatEUR(modelo425.totalIgicDevengado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total IGIC deducible</p>
              <p className="text-xl font-semibold">{formatEUR(modelo425.totalIgicDeducible)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resultado anual</p>
              <p className={`text-xl font-semibold ${modelo425.totalResultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                {formatEUR(Math.abs(modelo425.totalResultado))}
                <span className="text-xs ml-1">{modelo425.totalResultado >= 0 ? "(a pagar)" : "(a devolver)"}</span>
              </p>
            </div>
          </div>

          {/* Quarterly breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-2 font-medium">Trimestre</th>
                  <th className="text-right pb-2 font-medium">IGIC devengado</th>
                  <th className="text-right pb-2 font-medium">IGIC deducible</th>
                  <th className="text-right pb-2 font-medium">Resultado</th>
                  <th className="text-right pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelo425.quarters.map((q, i) => (
                  <tr key={q.quarter}>
                    <td className="py-2 text-muted-foreground">{quarterLabels[i]}</td>
                    <td className="py-2 text-right">{formatEUR(q.totalIgicDevengado)}</td>
                    <td className="py-2 text-right">{formatEUR(q.cuotaDeducible)}</td>
                    <td className={`py-2 text-right font-medium ${q.resultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatEUR(q.resultado)}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/tax/${modelo425.year}/${q.quarter}`} className="text-xs text-primary hover:underline">
                        Detalle &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">Total anual</td>
                  <td className="py-2 text-right">{formatEUR(modelo425.totalIgicDevengado)}</td>
                  <td className="py-2 text-right">{formatEUR(modelo425.totalIgicDeducible)}</td>
                  <td className={`py-2 text-right ${modelo425.totalResultado >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatEUR(modelo425.totalResultado)}
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
          El Modelo 425 es el resumen anual del IGIC. Se presenta en enero del anno siguiente junto con la declaracion del Q4 (Modelo 420)
          ante la Agencia Tributaria Canaria. Verifica todos los importes antes de presentar la declaracion.
        </p>
      </div>
    </div>
  )
}
