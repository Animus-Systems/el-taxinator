import { AnualReport } from "@/components/tax/anual-report"
import { serverClient } from "@/lib/trpc/server-client"
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { Link } from "@/lib/navigation"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ locale: string; year: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "tax" })
  return { title: t("modelo425") }
}

export default async function AnualReportPage({ params }: Props) {
  const { locale, year: yearStr } = await params
  setRequestLocale(locale)
  const year = parseInt(yearStr)
  if (isNaN(year)) notFound()

  const t = await getTranslations({ locale, namespace: "tax" })
  const trpc = await serverClient()
  const modelo425 = await trpc.tax.modelo425({ year })

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/tax" className="hover:underline">{t("title")}</Link>
            <span>/</span>
            <span>{year}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{t("modelo425")} — {t("annualSummary")} {year}</h2>
          <p className="text-muted-foreground mt-1">{t("annualSummary")} {year}</p>
        </div>
      </header>
      <main>
        <AnualReport modelo425={modelo425} />
      </main>
    </>
  )
}
