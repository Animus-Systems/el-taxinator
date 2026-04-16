
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntityType } from "@/lib/entities"
import { useLocale, useTranslations } from "next-intl"
import { AlertCircle, ChevronRight, FileText } from "lucide-react"
import { Link, useRouter } from "@/lib/navigation"

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

function formatEUR(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function isOverdue(deadline: Date) {
  return new Date() > deadline
}

function isDueSoon(deadline: Date) {
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
}

export function TaxDashboard({ year, summary, deadlines, entityType = "autonomo" }: Props) {
  const router = useRouter()
  const t = useTranslations("tax")
  const locale = useLocale()
  const deadlineCount = deadlines.length

  function changeYear(delta: number) {
    router.push(`/tax?year=${year + delta}`)
  }

  return (
    <div className="space-y-8">
      {/* Year selector */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => changeYear(-1)}>&larr;</Button>
        <span className="font-semibold text-lg">{year}</span>
        <Button variant="outline" size="sm" onClick={() => changeYear(1)}>&rarr;</Button>
        <Link href={`/tax/${year}`}>
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-1" />
            {t("modelo425")}
          </Button>
        </Link>
      </div>

      {/* Quarterly cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.map((item) => {
          const { quarter, label, deadline, modelo420 } = item
          const modelo130 = item.modelo130
          const modelo202 = item.modelo202
          const overdue = isOverdue(deadline)
          const dueSoon = isDueSoon(deadline)
          const igicResult = modelo420.resultado

          return (
            <Card key={quarter} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{label}</CardTitle>
                  {overdue ? (
                    <Badge variant="secondary" className="text-xs">{t("presented")}</Badge>
                  ) : dueSoon ? (
                    <Badge variant="destructive" className="text-xs flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {t("upcomingDeadline")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">{t("pending")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("deadline")}: {deadline.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">IGIC</p>
                    <p className="text-xs">{t("igicDevengado")}: <span className="font-medium">{formatEUR(modelo420.totalIgicDevengado, locale)}</span></p>
                    <p className="text-xs">{t("igicDeducible")}: <span className="font-medium">&minus;{formatEUR(modelo420.cuotaDeducible, locale)}</span></p>
                    <p className={`text-sm font-semibold ${igicResult >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {igicResult >= 0 ? `${t("toPay")}: ` : `${t("toReturn")}: `}
                      {formatEUR(Math.abs(igicResult), locale)}
                    </p>
                  </div>
                  {entityType === "sl" && modelo202 ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("corporateTax")}</p>
                      <p className="text-xs">{t("taxableBase")}: <span className="font-medium">{formatEUR(modelo202.casilla01_baseImponible, locale)}</span></p>
                      <p className="text-xs">{t("corporateRate")}: <span className="font-medium">{modelo202.casilla02_tipoGravamen ?? 25}%</span></p>
                      <p className={`text-sm font-semibold ${modelo202.casilla05_aIngresar > 0 ? "text-red-600" : "text-green-600"}`}>
                        {modelo202.casilla05_aIngresar > 0 ? `${t("toPay")}: ` : `${t("noPayment")}: `}
                        {modelo202.casilla05_aIngresar > 0 ? formatEUR(modelo202.casilla05_aIngresar, locale) : "\u2014"}
                      </p>
                    </div>
                  ) : modelo130 ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">IRPF</p>
                      <p className="text-xs">{t("income")}: <span className="font-medium">{formatEUR(modelo130.casilla01_ingresos, locale)}</span></p>
                      <p className="text-xs">{t("irpfWithheld")}: <span className="font-medium">&minus;{formatEUR(modelo130.casilla05_irpfRetenido, locale)}</span></p>
                      <p className={`text-sm font-semibold ${modelo130.casilla06_aIngresar > 0 ? "text-red-600" : "text-green-600"}`}>
                        {modelo130.casilla06_aIngresar > 0 ? `${t("toPayIrpf")}: ` : `${t("noPayment")}: `}
                        {modelo130.casilla06_aIngresar > 0 ? formatEUR(modelo130.casilla06_aIngresar, locale) : "\u2014"}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {modelo420.invoiceCount} {t("invoices")} &middot; {modelo420.expenseCount} {t("expenses")}
                  </span>
                  <Link href={`/tax/${year}/${quarter}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      {t("viewDetail")} <ChevronRight className="w-3 h-3 ml-1" />
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
          <CardTitle className="text-base">{t("yearSummary", { year })}</CardTitle>
          <p className="text-xs text-muted-foreground">{deadlineCount} {t("deadlinesMonitored")}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
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
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{formatEUR(value, locale)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Link href={`/tax/${year}`}>
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                {t("viewFullModelo")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
