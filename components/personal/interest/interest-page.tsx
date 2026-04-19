import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Landmark, Plus } from "lucide-react"
import { IncomeSourceYearView } from "../shared/income-source-year-view"
import { AddIncomeSourceDialog } from "../shared/add-income-source-dialog"

export function InterestPage() {
  const { t } = useTranslation("tax")
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <IncomeSourceYearView
        kind="interest"
        title={t("personal.interest.title")}
        pageSubtitle={t("personal.interest.pageSubtitle")}
        headerIcon={<Landmark className="h-6 w-6" />}
        sourceIcon={<Landmark className="h-5 w-5" />}
        emptyIcon={<Landmark className="h-10 w-10 text-muted-foreground" />}
        emptyHint={t("personal.interest.emptyHint")}
        confirmDeleteTitle={() => t("personal.interest.confirmDeleteTitle")}
        confirmDeleteBody={(name) => t("personal.interest.confirmDeleteBody", { name })}
        confirmDeleteLabel={t("personal.interest.delete")}
        headerActions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("personal.interest.addSource")}
          </Button>
        }
        emptyStateActions={
          <Button onClick={() => setAddOpen(true)}>
            {t("personal.interest.addSource")}
          </Button>
        }
        renderSourceBadges={(src) =>
          src.taxId ? (
            <Badge variant="outline" className="text-[10px]">
              {src.taxId}
            </Badge>
          ) : null
        }
        renderSourceSubtitle={(_src, totals) =>
          totals
            ? t("personal.interest.ytdSummary", {
                gross: formatCurrency(totals.grossCents, "EUR"),
                withheld: formatCurrency(totals.withheldCents, "EUR"),
              })
            : t("personal.interest.noDataYet")
        }
      />

      <AddIncomeSourceDialog open={addOpen} onOpenChange={setAddOpen} kind="interest" />
    </>
  )
}
