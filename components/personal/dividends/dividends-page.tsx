import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Plus, TrendingUp } from "lucide-react"
import { IncomeSourceYearView } from "../shared/income-source-year-view"
import { AddIncomeSourceDialog } from "../shared/add-income-source-dialog"

export function DividendsPage() {
  const { t } = useTranslation("tax")
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <IncomeSourceYearView
        kind="dividend"
        title={t("personal.dividend.title")}
        pageSubtitle={t("personal.dividend.pageSubtitle")}
        headerIcon={<TrendingUp className="h-6 w-6" />}
        sourceIcon={<TrendingUp className="h-5 w-5" />}
        emptyIcon={<TrendingUp className="h-10 w-10 text-muted-foreground" />}
        emptyHint={t("personal.dividend.emptyHint")}
        confirmDeleteTitle={() => t("personal.dividend.confirmDeleteTitle")}
        confirmDeleteBody={(name) => t("personal.dividend.confirmDeleteBody", { name })}
        confirmDeleteLabel={t("personal.dividend.delete")}
        headerActions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("personal.dividend.addSource")}
          </Button>
        }
        emptyStateActions={
          <Button onClick={() => setAddOpen(true)}>
            {t("personal.dividend.addSource")}
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
            ? t("personal.dividend.ytdSummary", {
                gross: formatCurrency(totals.grossCents, "EUR"),
                withheld: formatCurrency(totals.withheldCents, "EUR"),
              })
            : t("personal.dividend.noDataYet")
        }
      />

      <AddIncomeSourceDialog open={addOpen} onOpenChange={setAddOpen} kind="dividend" />
    </>
  )
}
