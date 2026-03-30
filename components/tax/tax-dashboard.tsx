"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QuarterlySummary } from "@/models/tax"
import { AlertCircle, CheckCircle, ChevronRight, FileText } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

type Deadline = {
  quarter: number
  label: string
  deadline: Date
  forms: string[]
}

type Props = {
  year: number
  summary: QuarterlySummary[]
  deadlines: Deadline[]
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function isOverdue(deadline: Date) {
  return new Date() > deadline
}

function isDueSoon(deadline: Date) {
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000 // 30 days
}

export function TaxDashboard({ year, summary, deadlines }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function changeYear(delta: number) {
    router.push(`/tax?year=${year + delta}`)
  }

  return (
    <div className="space-y-8">
      {/* Year selector */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => changeYear(-1)}>←</Button>
        <span className="font-semibold text-lg">{year}</span>
        <Button variant="outline" size="sm" onClick={() => changeYear(1)}>→</Button>
        <Link href={`/tax/${year}`}>
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-1" />
            Modelo 390 Anual
          </Button>
        </Link>
      </div>

      {/* Quarterly cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.map(({ quarter, label, deadline, modelo303, modelo130 }) => {
          const overdue = isOverdue(deadline)
          const dueSoon = isDueSoon(deadline)
          const vatResult = modelo303.casilla46_resultado
          const irpfResult = modelo130.casilla06_aIngresar

          return (
            <Card key={quarter} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{label}</CardTitle>
                  {overdue ? (
                    <Badge variant="secondary" className="text-xs">Presentado</Badge>
                  ) : dueSoon ? (
                    <Badge variant="destructive" className="text-xs flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Próximo plazo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pendiente</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Plazo: {deadline.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Modelo 303 — IVA</p>
                    <p className="text-xs">IVA repercutido: <span className="font-medium">{formatEUR(modelo303.totalIvaRepercutido)}</span></p>
                    <p className="text-xs">IVA deducible: <span className="font-medium">−{formatEUR(modelo303.casilla29_cuotaDeducible)}</span></p>
                    <p className={`text-sm font-semibold ${vatResult >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {vatResult >= 0 ? "A pagar: " : "A devolver: "}
                      {formatEUR(Math.abs(vatResult))}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Modelo 130 — IRPF</p>
                    <p className="text-xs">Ingresos: <span className="font-medium">{formatEUR(modelo130.casilla01_ingresos)}</span></p>
                    <p className="text-xs">IRPF retenido: <span className="font-medium">−{formatEUR(modelo130.casilla05_irpfRetenido)}</span></p>
                    <p className={`text-sm font-semibold ${irpfResult > 0 ? "text-red-600" : "text-green-600"}`}>
                      {irpfResult > 0 ? "A ingresar: " : "Sin pago: "}
                      {irpfResult > 0 ? formatEUR(irpfResult) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {modelo303.invoiceCount} facturas · {modelo303.expenseCount} gastos
                  </span>
                  <Link href={`/tax/${year}/${quarter}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      Ver detalle <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Annual total */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen del año {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "IVA total repercutido", value: summary.reduce((s, q) => s + q.modelo303.totalIvaRepercutido, 0) },
              { label: "IVA total deducible", value: summary.reduce((s, q) => s + q.modelo303.casilla29_cuotaDeducible, 0) },
              { label: "Ingresos totales", value: summary.length > 0 ? summary[summary.length - 1].modelo130.casilla01_ingresos : 0 },
              { label: "IRPF retenido", value: summary.length > 0 ? summary[summary.length - 1].modelo130.casilla05_irpfRetenido : 0 },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{formatEUR(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Link href={`/tax/${year}`}>
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Ver Modelo 390 completo
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
