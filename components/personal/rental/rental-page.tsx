import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Home, Plus } from "lucide-react"
import { AddRentalDialog } from "./add-rental-dialog"
import { IncomeSourceYearView } from "../shared/income-source-year-view"

export function RentalPage() {
  const { t } = useTranslation("tax")
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <IncomeSourceYearView
        kind="rental"
        title={t("personal.rental.title")}
        pageSubtitle={t("personal.rental.pageSubtitle")}
        headerIcon={<Home className="h-6 w-6" />}
        sourceIcon={<Home className="h-5 w-5" />}
        emptyIcon={<Home className="h-10 w-10 text-muted-foreground" />}
        emptyHint={t("personal.rental.emptyHint")}
        confirmDeleteTitle={() => t("personal.rental.confirmDeleteTitle")}
        confirmDeleteBody={(name) => t("personal.rental.confirmDeleteBody", { name })}
        confirmDeleteLabel={t("personal.rental.delete")}
        headerActions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("personal.rental.addProperty")}
          </Button>
        }
        emptyStateActions={
          <Button onClick={() => setAddOpen(true)}>
            {t("personal.rental.addProperty")}
          </Button>
        }
        renderSourceBadges={(src) => {
          const meta = src.metadata as { rentalType?: string }
          return meta.rentalType ? (
            <Badge variant="outline" className="text-[10px]">
              {t(`personal.rental.type.${meta.rentalType}`, { defaultValue: meta.rentalType })}
            </Badge>
          ) : null
        }}
        renderSourceSubtitle={(src, totals) => {
          const meta = src.metadata as { address?: string }
          const addr = meta.address ?? "—"
          if (totals) {
            return `${addr} · ${t("personal.rental.ytdSummary", {
              amount: formatCurrency(totals.grossCents, "EUR"),
            })}`
          }
          return addr
        }}
      />

      <AddRentalDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  )
}
