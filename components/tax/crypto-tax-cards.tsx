import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, Globe, AlertTriangle, Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { EntityType } from "@/lib/entities"

const fmt = (cents: number): string => formatCurrency(cents, "EUR")

export function CryptoTaxCards({
  year,
  entityType,
}: {
  year: number
  entityType: EntityType
}) {
  const { t } = useTranslation("tax")

  const modelo100Query = trpc.tax.modelo100.useQuery(
    { year },
    { enabled: entityType === "autonomo" },
  )
  const modelo200Query = trpc.tax.modelo200.useQuery(
    { year, taxRate: 25 },
    { enabled: entityType === "sl" },
  )
  const modelo721 = trpc.tax.modelo721.useQuery({ year })

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          {t("cryptoSectionHeading")}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t("cryptoSectionSubtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entityType === "autonomo" ? (
          <Modelo100Card data={modelo100Query.data} loading={modelo100Query.isLoading} />
        ) : (
          <Modelo200CryptoCard data={modelo200Query.data} loading={modelo200Query.isLoading} />
        )}
        <Modelo721Card data={modelo721.data} loading={modelo721.isLoading} />
      </div>
    </section>
  )
}

function Modelo100Card({
  data,
  loading,
}: {
  data:
    | {
        baseImponibleAhorro: number
        gananciasPatrimoniales: number
        rendimientoCapitalMobiliario: number
        cuotaAhorro: number
        ahorroBreakdown: Array<{ rate: number; amountInBracketCents: number; taxInBracketCents: number }>
        untrackedDisposalsCount: number
      }
    | undefined
  loading: boolean
}) {
  const { t } = useTranslation("tax")
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium tracking-tight">
            {t("modelo100Heading")}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {t("annualIrpf")}
          </Badge>
        </div>
        {loading || !data ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-1.5 text-[12px]">
            <Row label={t("gananciasPatrimonialesLabel")} value={fmt(data.gananciasPatrimoniales)} />
            <Row label={t("rendimientoMobiliarioLabel")} value={fmt(data.rendimientoCapitalMobiliario)} />
            <Row
              label={t("baseAhorroLabel")}
              value={fmt(data.baseImponibleAhorro)}
              emphasized
            />
            <Row
              label={t("cuotaAhorroLabel")}
              value={fmt(data.cuotaAhorro)}
              emphasized
            />
            {data.ahorroBreakdown.some((b) => b.amountInBracketCents > 0) ? (
              <div className="pt-1 border-t border-border/40 space-y-1 text-[11px] text-muted-foreground">
                {data.ahorroBreakdown
                  .filter((b) => b.amountInBracketCents > 0)
                  .map((b, i) => (
                    <div key={i} className="flex items-baseline justify-between tabular-nums">
                      <span>
                        {Math.round(b.rate * 100)}%
                        <span className="text-muted-foreground/60"> · </span>
                        {fmt(b.amountInBracketCents)}
                      </span>
                      <span>→ {fmt(b.taxInBracketCents)}</span>
                    </div>
                  ))}
              </div>
            ) : null}
            {data.untrackedDisposalsCount > 0 ? (
              <div className="pt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {t("untrackedDisposalsHint", { count: data.untrackedDisposalsCount })}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Modelo200CryptoCard({
  data,
  loading,
}: {
  data:
    | {
        cryptoGainCents: number
        stakingIncomeCents: number
        baseImponible: number
        cuotaIntegra: number
        tipoGravamen: number
      }
    | undefined
  loading: boolean
}) {
  const { t } = useTranslation("tax")
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium tracking-tight">
            {t("modelo200Heading")}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {t("annualIs")}
          </Badge>
        </div>
        {loading || !data ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-1.5 text-[12px]">
            <Row label={t("cryptoGainLabel")} value={fmt(data.cryptoGainCents)} />
            <Row label={t("stakingIncomeLabel")} value={fmt(data.stakingIncomeCents)} />
            <Row label={t("baseImponibleLabel")} value={fmt(data.baseImponible)} emphasized />
            <Row
              label={t("cuotaIntegraLabel", { rate: data.tipoGravamen })}
              value={fmt(data.cuotaIntegra)}
              emphasized
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Modelo721Card({
  data,
  loading,
}: {
  data:
    | {
        thresholdCents: number
        totalValueCents: number
        obligation: boolean
        deadline: Date
        assets: Array<{ asset: string; quantity: string; yearEndValueCents: number }>
      }
    | undefined
  loading: boolean
}) {
  const { t } = useTranslation("tax")
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium tracking-tight flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {t("modelo721Heading")}
          </div>
          {data ? (
            <Badge
              variant={data.obligation ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {data.obligation ? t("obligationYes") : t("obligationNo")}
            </Badge>
          ) : null}
        </div>
        {loading || !data ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-1.5 text-[12px]">
            <Row
              label={t("totalValueLabel")}
              value={fmt(data.totalValueCents)}
              emphasized
            />
            <Row label={t("thresholdLabel")} value={fmt(data.thresholdCents)} />
            <Row label={t("deadlineLabel")} value={new Date(data.deadline).toLocaleDateString()} />
            {data.assets.length > 0 ? (
              <div className="pt-1 border-t border-border/40 space-y-0.5 text-[11px] text-muted-foreground">
                {data.assets.map((a) => (
                  <div key={a.asset} className="flex items-baseline justify-between tabular-nums">
                    <span>
                      {a.asset}
                      <span className="text-muted-foreground/60"> · </span>
                      {Number(a.quantity).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </span>
                    <span>{fmt(a.yearEndValueCents)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={emphasized ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={["tabular-nums", emphasized ? "font-medium" : ""].join(" ")}>
        {value}
      </span>
    </div>
  )
}
