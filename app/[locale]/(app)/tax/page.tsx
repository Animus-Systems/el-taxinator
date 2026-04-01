import { TaxDashboard } from "@/components/tax/tax-dashboard"
import { serverClient } from "@/lib/trpc/server-client"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Tax",
  description: "Tax management: VAT (Model 303), IRPF (Model 130) and annual summary (Model 390)",
}

export default async function TaxPage({ searchParams, params }: { searchParams: Promise<{ year?: string }>; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("tax")
  const trpc = await serverClient()
  const searchP = await searchParams
  const year = parseInt(searchP.year ?? "") || new Date().getFullYear()

  const [summary, deadlines, entityType] = await Promise.all([
    trpc.tax.yearSummary({ year, locale }),
    trpc.tax.deadlines({ year, locale }),
    trpc.tax.entityType({}),
  ])

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{year}</span>
        </h2>
      </header>
      <main>
        <TaxDashboard year={year} summary={summary} deadlines={deadlines} entityType={entityType.type} />
      </main>
    </>
  )
}
