import { QuarterlyReport } from "@/components/tax/quarterly-report"
import { getCurrentUser } from "@/lib/auth"
import { calcModelo130, calcModelo303, getFilingDeadline, getQuarterLabel, Quarter } from "@/models/tax"
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Informe Trimestral" }

type Params = { year: string; quarter: string }

export default async function QuarterlyReportPage({ params }: { params: Promise<Params> }) {
  const { year: yearStr, quarter: quarterStr } = await params
  const year = parseInt(yearStr)
  const quarter = parseInt(quarterStr) as Quarter

  if (isNaN(year) || ![1, 2, 3, 4].includes(quarter)) notFound()

  const user = await getCurrentUser()
  const [modelo303, modelo130] = await Promise.all([
    calcModelo303(user.id, year, quarter),
    calcModelo130(user.id, year, quarter),
  ])

  const deadline = getFilingDeadline(year, quarter)
  const label = getQuarterLabel(quarter)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/tax" className="hover:underline">Impuestos</Link>
            <span>/</span>
            <span>{year}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{label} {year}</h2>
          <p className="text-muted-foreground mt-1">
            Plazo de presentación: {deadline.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </header>
      <main>
        <QuarterlyReport modelo303={modelo303} modelo130={modelo130} year={year} quarter={quarter} />
      </main>
    </>
  )
}
