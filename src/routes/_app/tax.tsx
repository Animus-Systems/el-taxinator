/**
 * Tax reports page — SPA equivalent of app/[locale]/(app)/tax/page.tsx
 *
 * Fetches yearly tax summary, deadlines, and entity type via tRPC.
 * The year is read from URL search params (defaults to current year).
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { TaxDashboard } from "@/components/tax/tax-dashboard"
import { CryptoTaxCards } from "@/components/tax/crypto-tax-cards"
import type { EntityType } from "@/lib/entities"

type TaxSummaryItem = {
  quarter: number
  label: string
  deadline: Date
  forms: string[]
  modelo420: {
    totalIgicDevengado: number
    cuotaDeducible: number
    resultado: number
    invoiceCount: number
    expenseCount: number
  }
  modelo130?: {
    casilla01_ingresos: number
    casilla05_irpfRetenido: number
    casilla06_aIngresar: number
  }
  modelo202?: {
    casilla01_baseImponible: number
    casilla02_tipoGravamen: number
    casilla05_aIngresar: number
  }
}

export function TaxPage() {
  const { t } = useTranslation("tax")

  // Read year from URL search params
  const searchParams = new URLSearchParams(window.location.search)
  const year = parseInt(searchParams.get("year") ?? "") || new Date().getFullYear()

  // Determine locale for tax data
  const locale = document.documentElement.lang || "en"

  const { data: summary, isLoading: summaryLoading } = trpc.tax.yearSummary.useQuery({ year, locale })
  const { data: deadlines, isLoading: deadlinesLoading } = trpc.tax.deadlines.useQuery({ year, locale })
  const { data: entityType, isLoading: entityTypeLoading } = trpc.tax.entityType.useQuery({})

  if (summaryLoading || deadlinesLoading || entityTypeLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{year}</span>
        </h2>
      </header>
      <main className="space-y-8">
        <TaxDashboard
          year={year}
          summary={(Array.isArray(summary) ? summary : []) as TaxSummaryItem[]}
          deadlines={deadlines ?? []}
          entityType={(((entityType as Record<string, unknown>)?.type as string) ?? "autonomo") as EntityType}
        />
        <CryptoTaxCards
          year={year}
          entityType={(((entityType as Record<string, unknown>)?.type as string) ?? "autonomo") as EntityType}
        />
      </main>
    </>
  )
}
