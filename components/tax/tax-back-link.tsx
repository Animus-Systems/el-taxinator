import { Link } from "@/lib/navigation"
import { ChevronLeft } from "lucide-react"
import { useTranslations } from "next-intl"

export function TaxBackLink({ year }: { year?: number }) {
  const t = useTranslations("tax")
  const href = year ? `/tax?year=${year}` : "/tax"
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {t("hero.backToCalculator")}
    </Link>
  )
}
