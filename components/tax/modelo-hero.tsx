import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { TaxFiling } from "@/lib/db-types"
import { Link } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { BookOpen, Calendar, Check, ExternalLink, FileDown, Loader2, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"

export type ModeloAgency = "aeat" | "atc"

export type ModeloHeroProps = {
  modeloCode: string
  title: string
  subtitle?: string
  deadline: Date
  agency: ModeloAgency
  amountCents: number | null
  positiveLabel: string
  negativeLabel: string
  zeroLabel: string
  filing: TaxFiling | null
  year: number
  quarter: number | null
  onExportCsv?: () => void
  portalUrl?: string
  knowledgeSlug?: string
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

export function ModeloHero({
  modeloCode,
  title,
  subtitle,
  deadline,
  agency,
  amountCents,
  positiveLabel,
  negativeLabel,
  zeroLabel,
  filing,
  year,
  quarter,
  onExportCsv,
  portalUrl,
  knowledgeSlug,
}: ModeloHeroProps) {
  const t = useTranslations("tax")
  const utils = trpc.useUtils()
  const upsert = trpc.taxFilings.upsert.useMutation({
    onSuccess: async () => {
      await utils.taxFilings.list.invalidate({ year })
    },
  })

  const isFiled = Boolean(filing?.filedAt)
  const days = daysUntil(deadline)
  const isOverdue = !isFiled && days < 0
  const isSoon = !isFiled && days >= 0 && days < 30

  const amountTone =
    amountCents === null || amountCents === 0
      ? "muted"
      : amountCents > 0
        ? "positive"
        : "negative"

  const amountLabel =
    amountCents === null
      ? zeroLabel
      : amountCents > 0
        ? positiveLabel
        : amountCents < 0
          ? negativeLabel
          : zeroLabel

  const amountColor =
    amountTone === "positive"
      ? "text-red-600 dark:text-red-400"
      : amountTone === "negative"
        ? "text-green-600 dark:text-green-400"
        : "text-muted-foreground"

  const ringClass = isOverdue
    ? "ring-1 ring-red-300/50 bg-red-50/30 dark:bg-red-950/20"
    : isSoon
      ? "ring-1 ring-amber-300/50 bg-amber-50/30 dark:bg-amber-950/20"
      : ""

  async function toggleFiled(next: boolean): Promise<void> {
    await upsert.mutateAsync({
      year,
      quarter,
      modeloCode,
      filedAt: next ? new Date() : null,
    })
  }

  return (
    <Card className={cn("overflow-hidden", ringClass)}>
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {isFiled && filing?.filedAt ? (
                <Badge
                  variant="outline"
                  className="border-green-500/40 text-green-700 dark:text-green-400"
                >
                  <Check className="mr-1 h-3 w-3" />
                  {t("hero.filedOn", { date: format(filing.filedAt, "dd MMM yyyy") })}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">
                  {t("pending")}
                </Badge>
              )}
            </div>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {t("deadline")}: {format(deadline, "dd MMM yyyy")}
              </span>
              {!isFiled && isOverdue ? (
                <span className="text-red-600 dark:text-red-400">
                  · {Math.abs(days) === 1 ? t("hero.overdueByOneDay") : t("hero.overdueBy", { days: Math.abs(days) })}
                </span>
              ) : null}
              {!isFiled && !isOverdue && days === 0 ? (
                <span className="text-amber-600 dark:text-amber-400">· {t("hero.dueToday")}</span>
              ) : null}
              {!isFiled && !isOverdue && days > 0 ? (
                <span className={cn(isSoon ? "text-amber-600 dark:text-amber-400" : "")}>
                  · {days === 1 ? t("hero.dueInOneDay") : t("hero.dueInDays", { days })}
                </span>
              ) : null}
            </p>
          </div>

          <div className="text-left md:text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {amountLabel}
            </p>
            <p className={cn("text-3xl font-semibold tabular-nums", amountColor)}>
              {amountCents === null ? "—" : formatEUR(Math.abs(amountCents))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Modelo {modeloCode} · {t(`agency.${agency}`)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {isFiled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void toggleFiled(false)
              }}
              disabled={upsert.isPending}
            >
              {upsert.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-1 h-4 w-4" />
              )}
              {t("hero.markAsUnfiled")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                void toggleFiled(true)
              }}
              disabled={upsert.isPending}
            >
              {upsert.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              {t("hero.markAsFiled")}
            </Button>
          )}
          {onExportCsv ? (
            <Button variant="outline" size="sm" onClick={onExportCsv}>
              <FileDown className="mr-1 h-4 w-4" />
              {t("checklist.exportCsv")}
            </Button>
          ) : null}
          {portalUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                {t("agency.openPortal", { agency: t(`agency.${agency}`) })}
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </Button>
          ) : null}
          {knowledgeSlug ? (
            <Link
              href={`/settings/knowledge?slug=${knowledgeSlug}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t("hero.viewFilingProcedure")}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
