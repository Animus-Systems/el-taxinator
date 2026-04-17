import { useParams } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { AnualReport } from "@/components/tax/anual-report"
import { TaxBackLink } from "@/components/tax/tax-back-link"

export function TaxYearPage() {
  const { year: yearParam } = useParams({ strict: false }) as { year?: string }
  const year = Number.parseInt(yearParam ?? "", 10)

  const { data: modelo425, isLoading } = trpc.tax.modelo425.useQuery(
    { year },
    { enabled: Number.isInteger(year) },
  )

  if (!Number.isInteger(year)) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Invalid tax year</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!modelo425) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Annual tax summary not found</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TaxBackLink year={year} />
      <AnualReport modelo425={modelo425} />
    </div>
  )
}
