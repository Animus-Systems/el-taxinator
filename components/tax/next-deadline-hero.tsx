import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Link } from "@/lib/navigation"
import { format } from "date-fns"
import { ArrowRight, Calendar } from "lucide-react"
import { useTranslations } from "next-intl"

type IgicResult = { resultado: number }
type IrpfResult = { casilla06_aIngresar: number }
type CorpResult = { casilla05_aIngresar: number }

export type NextDeadlineHeroProps = {
  year: number
  quarter: number
  label: string
  deadline: Date
  forms: string[]
  modelo420: IgicResult
  modelo130?: IrpfResult
  modelo202?: CorpResult
  entityType: "autonomo" | "sl" | "individual"
}

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function daysUntil(deadline: Date): number {
  const today = new Date()
  const d = new Date(deadline)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function NextDeadlineHero({
  year,
  quarter,
  label,
  deadline,
  forms,
  modelo420,
  modelo130,
  modelo202,
  entityType,
}: NextDeadlineHeroProps) {
  const t = useTranslations("tax")
  const days = daysUntil(deadline)
  const isOverdue = days < 0
  const isImminent = !isOverdue && days <= 30

  const igic = Math.max(0, modelo420.resultado)
  const secondary = entityType === "sl" ? modelo202?.casilla05_aIngresar ?? 0 : modelo130?.casilla06_aIngresar ?? 0
  const totalOwed = igic + Math.max(0, secondary)

  const tintClass = isOverdue
    ? "ring-1 ring-red-300/60 bg-red-50/40 dark:bg-red-950/20"
    : isImminent
      ? "ring-1 ring-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20"
      : ""

  const deadlineLine = isOverdue
    ? Math.abs(days) === 1
      ? t("hero.overdueByOneDay")
      : t("hero.overdueBy", { days: Math.abs(days) })
    : days === 0
      ? t("hero.dueToday")
      : days === 1
        ? t("hero.dueInOneDay")
        : t("hero.dueInDays", { days })

  return (
    <Card className={cn("overflow-hidden", tintClass)}>
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {t("hero.nextDeadline")}
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-2xl font-semibold tracking-tight">{label}</h3>
            <div className="flex flex-wrap gap-1.5">
              {forms.map((f) => (
                <Badge key={f} variant="outline" className="text-[10px] font-mono">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
          <div
            className={cn(
              "text-sm font-medium",
              isOverdue ? "text-red-600 dark:text-red-400" : isImminent ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {deadlineLine} · {format(deadline, "dd MMM yyyy")}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex flex-col md:items-end">
            {totalOwed > 0 ? (
              <>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("hero.toPayAmount")}</span>
                <span className="text-3xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {formatEUR(totalOwed)}
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{t("hero.nothingToPay")}</span>
            )}
          </div>
          <Link href={`/tax/${year}/${quarter}`}>
            <Button size="sm" className="gap-1">
              {t("hero.viewDetail")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
