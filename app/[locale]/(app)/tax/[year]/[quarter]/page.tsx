import { QuarterlyReport } from "@/components/tax/quarterly-report"
import { serverClient } from "@/lib/trpc/server-client"
import { getFilingDeadline, getQuarterLabel, Quarter } from "@/models/tax"
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { Link } from "@/lib/navigation"
import { notFound } from "next/navigation"

type Params = { locale: string; year: string; quarter: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "tax" })
  return { title: t("quarterlySummary") }
}

export default async function QuarterlyReportPage({ params }: { params: Promise<Params> }) {
  const { locale, year: yearStr, quarter: quarterStr } = await params
  setRequestLocale(locale)
  const year = parseInt(yearStr)
  const quarter = parseInt(quarterStr) as Quarter

  if (isNaN(year) || ![1, 2, 3, 4].includes(quarter)) notFound()

  const t = await getTranslations({ locale, namespace: "tax" })
  const trpc = await serverClient()
  const [modelo420, modelo130] = await Promise.all([
    trpc.tax.modelo420({ year, quarter }),
    trpc.tax.modelo130({ year, quarter }),
  ])

  const deadline = getFilingDeadline(year, quarter)
  const label = getQuarterLabel(quarter, locale)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/tax" className="hover:underline">{t("title")}</Link>
            <span>/</span>
            <span>{year}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{label} {year}</h2>
          <p className="text-muted-foreground mt-1">
            {t("deadline")}: {deadline.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </header>
      <main>
        <QuarterlyReport modelo420={modelo420} modelo130={modelo130} year={year} quarter={quarter} />
      </main>
    </>
  )
}
