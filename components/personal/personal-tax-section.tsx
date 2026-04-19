import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Briefcase, HandCoins, Home, Landmark, TrendingUp, Coins } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { PersonalTaxCard } from "./personal-tax-card"

type Props = { year: number }

export function PersonalTaxSection({ year }: Props) {
  const { t } = useTranslation("tax")

  const { data: employers = [] } = trpc.incomeSources.list.useQuery({ kind: "salary" })
  const { data: rentals = [] } = trpc.incomeSources.list.useQuery({ kind: "rental" })
  const { data: dividends = [] } = trpc.incomeSources.list.useQuery({ kind: "dividend" })
  const { data: interests = [] } = trpc.incomeSources.list.useQuery({ kind: "interest" })
  const { data: totals = [] } = trpc.incomeSources.totals.useQuery({ year })
  const { data: cryptoSummary } = trpc.crypto.summary.useQuery({ year })
  const { data: deductions = [] } = trpc.deductions.list.useQuery({ taxYear: year })

  const totalsBySource = new Map(totals.map((t) => [t.sourceId, t]))

  const sumGross = (sources: Array<{ id: string }>): number =>
    sources
      .map((s) => totalsBySource.get(s.id)?.grossCents ?? 0)
      .reduce((a, b) => a + b, 0)

  const employmentGrossCents = sumGross(employers)
  const rentalGrossCents = sumGross(rentals)
  const dividendGrossCents = sumGross(dividends)
  const interestGrossCents = sumGross(interests)

  const realizedGainsCents =
    (cryptoSummary as { realizedGainCents?: number } | undefined)?.realizedGainCents ?? 0

  const deductionsTotalCents = deductions
    .map((d) => d.amountCents)
    .reduce((a, b) => a + b, 0)

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{t("personal.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("personal.subtitle")}</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <PersonalTaxCard
          title={t("personal.employment.title")}
          description={t("personal.employment.description")}
          icon={<Briefcase className="h-5 w-5" />}
          href="/personal/employment"
          cta={employers.length > 0 ? t("personal.manage") : t("personal.add")}
          summary={
            employers.length > 0
              ? t("personal.employment.summary", {
                  count: employers.length,
                  amount: formatCurrency(employmentGrossCents, "EUR"),
                })
              : t("personal.employment.empty")
          }
        />

        <PersonalTaxCard
          title={t("personal.rental.title")}
          description={t("personal.rental.description")}
          icon={<Home className="h-5 w-5" />}
          href="/personal/rental"
          cta={rentals.length > 0 ? t("personal.manage") : t("personal.add")}
          summary={
            rentals.length > 0
              ? t("personal.rental.summary", {
                  count: rentals.length,
                  amount: formatCurrency(rentalGrossCents, "EUR"),
                })
              : t("personal.rental.empty")
          }
        />

        <PersonalTaxCard
          title={t("personal.dividend.title")}
          description={t("personal.dividend.description")}
          icon={<TrendingUp className="h-5 w-5" />}
          href="/personal/dividends"
          cta={dividends.length > 0 ? t("personal.manage") : t("personal.add")}
          summary={
            dividends.length > 0
              ? t("personal.dividend.summary", {
                  count: dividends.length,
                  amount: formatCurrency(dividendGrossCents, "EUR"),
                })
              : t("personal.dividend.empty")
          }
        />

        <PersonalTaxCard
          title={t("personal.interest.title")}
          description={t("personal.interest.description")}
          icon={<Landmark className="h-5 w-5" />}
          href="/personal/interest"
          cta={interests.length > 0 ? t("personal.manage") : t("personal.add")}
          summary={
            interests.length > 0
              ? t("personal.interest.summary", {
                  count: interests.length,
                  amount: formatCurrency(interestGrossCents, "EUR"),
                })
              : t("personal.interest.empty")
          }
        />

        <PersonalTaxCard
          title={t("personal.investments.title")}
          description={t("personal.investments.description")}
          icon={<Coins className="h-5 w-5" />}
          href="/crypto"
          cta={realizedGainsCents !== 0 ? t("personal.manage") : t("personal.add")}
          summary={
            realizedGainsCents !== 0
              ? t("personal.investments.summary", {
                  gains: formatCurrency(realizedGainsCents, "EUR"),
                })
              : t("personal.investments.empty")
          }
        />

        <PersonalTaxCard
          title={t("personal.deductions.title")}
          description={t("personal.deductions.description")}
          icon={<HandCoins className="h-5 w-5" />}
          href="/personal/deductions"
          cta={deductions.length > 0 ? t("personal.manage") : t("personal.add")}
          summary={
            deductions.length > 0
              ? t("personal.deductions.summary", {
                  count: deductions.length,
                  amount: formatCurrency(deductionsTotalCents, "EUR"),
                })
              : t("personal.deductions.empty")
          }
        />
      </div>
    </section>
  )
}
