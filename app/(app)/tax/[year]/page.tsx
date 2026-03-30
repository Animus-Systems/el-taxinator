import { AnualReport } from "@/components/tax/anual-report"
import { getCurrentUser } from "@/lib/auth"
import { calcModelo390 } from "@/models/tax"
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Resumen Anual — Modelo 390" }

export default async function AnualReportPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params
  const year = parseInt(yearStr)
  if (isNaN(year)) notFound()

  const user = await getCurrentUser()
  const modelo390 = await calcModelo390(user.id, year)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/tax" className="hover:underline">Impuestos</Link>
            <span>/</span>
            <span>{year}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Modelo 390 — Resumen Anual {year}</h2>
          <p className="text-muted-foreground mt-1">Resumen anual del IVA</p>
        </div>
      </header>
      <main>
        <AnualReport modelo390={modelo390} />
      </main>
    </>
  )
}
