import { useParams } from "@tanstack/react-router"
import { QuarterlyReport } from "@/components/tax/quarterly-report"
import { QuarterlyCorporateReport } from "@/components/tax/quarterly-corporate-report"
import { trpc } from "~/trpc"

export function TaxQuarterPage() {
  const { year: yearParam, quarter: quarterParam } = useParams({ strict: false }) as {
    year?: string
    quarter?: string
  }

  const year = Number.parseInt(yearParam ?? "", 10)
  const quarter = Number.parseInt(quarterParam ?? "", 10)
  const isValidYear = Number.isInteger(year)
  const isValidQuarter = quarter >= 1 && quarter <= 4
  const isValidParams = isValidYear && isValidQuarter

  const { data: entityType, isLoading: entityTypeLoading } = trpc.tax.entityType.useQuery(
    {},
    { enabled: isValidParams },
  )
  const { data: modelo420, isLoading: modelo420Loading } = trpc.tax.modelo420.useQuery(
    { year, quarter: quarter as 1 | 2 | 3 | 4 },
    { enabled: isValidParams },
  )
  const { data: modelo130, isLoading: modelo130Loading } = trpc.tax.modelo130.useQuery(
    { year, quarter: quarter as 1 | 2 | 3 | 4 },
    { enabled: isValidParams && entityType?.type !== "sl" },
  )
  const { data: modelo202, isLoading: modelo202Loading } = trpc.tax.modelo202.useQuery(
    { year, quarter: quarter as 1 | 2 | 3 | 4, taxRate: 25 },
    { enabled: isValidParams && entityType?.type === "sl" },
  )

  if (!isValidParams) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Invalid tax period</div>
      </div>
    )
  }

  if (
    entityTypeLoading ||
    modelo420Loading ||
    (entityType?.type === "sl" ? modelo202Loading : modelo130Loading)
  ) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!modelo420) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Quarterly tax summary not found</div>
      </div>
    )
  }

  if (entityType?.type === "sl") {
    if (!modelo202) {
      return (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-muted-foreground">Corporate tax summary not found</div>
        </div>
      )
    }

    return (
      <QuarterlyCorporateReport
        year={year}
        quarter={quarter as 1 | 2 | 3 | 4}
        modelo420={modelo420}
        modelo202={modelo202}
      />
    )
  }

  if (!modelo130) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Quarterly IRPF summary not found</div>
      </div>
    )
  }

  return <QuarterlyReport year={year} quarter={quarter as 1 | 2 | 3 | 4} modelo420={modelo420} modelo130={modelo130} />
}
