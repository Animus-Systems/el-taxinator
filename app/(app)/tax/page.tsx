import { TaxDashboard } from "@/components/tax/tax-dashboard"
import { getCurrentUser } from "@/lib/auth"
import { getTaxYearSummary, getUpcomingDeadlines } from "@/models/tax"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Impuestos",
  description: "Gestión fiscal: IVA (Modelo 303), IRPF (Modelo 130) y resumen anual (Modelo 390)",
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await getCurrentUser()
  const params = await searchParams
  const year = parseInt(params.year ?? "") || new Date().getFullYear()

  const [summary, deadlines] = await Promise.all([
    getTaxYearSummary(user.id, year),
    Promise.resolve(getUpcomingDeadlines(year)),
  ])

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Impuestos</span>
          <span className="text-3xl tracking-tight opacity-20">{year}</span>
        </h2>
      </header>
      <main>
        <TaxDashboard year={year} summary={summary} deadlines={deadlines} />
      </main>
    </>
  )
}
