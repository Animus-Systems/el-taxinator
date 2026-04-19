import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Briefcase, Plus, Upload } from "lucide-react"
import { AddEmployerDialog } from "./add-employer-dialog"
import { PayslipUploadDialog } from "./payslip-upload-dialog"
import { IncomeSourceYearView } from "../shared/income-source-year-view"

export function EmploymentPage() {
  const { t } = useTranslation("tax")
  const [addOpen, setAddOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <>
      <IncomeSourceYearView
        kind="salary"
        title={t("personal.employment.title")}
        pageSubtitle={t("personal.employment.pageSubtitle")}
        headerIcon={<Briefcase className="h-6 w-6" />}
        sourceIcon={<Briefcase className="h-5 w-5" />}
        emptyIcon={<Briefcase className="h-10 w-10 text-muted-foreground" />}
        emptyHint={t("personal.employment.emptyHint")}
        confirmDeleteTitle={() => t("personal.employment.confirmDeleteTitle")}
        confirmDeleteBody={(name) => t("personal.employment.confirmDeleteBody", { name })}
        confirmDeleteLabel={t("personal.employment.delete")}
        headerActions={
          <>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("personal.employment.addEmployer")}
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              {t("personal.employment.uploadPayslip")}
            </Button>
          </>
        }
        emptyStateActions={
          <>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              {t("personal.employment.addEmployer")}
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              {t("personal.employment.uploadPayslip")}
            </Button>
          </>
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
            ? t("personal.employment.ytdSummary", {
                gross: formatCurrency(totals.grossCents, "EUR"),
                withheld: formatCurrency(totals.withheldCents, "EUR"),
              })
            : t("personal.employment.noPayslipsYet")
        }
      />

      <AddEmployerDialog open={addOpen} onOpenChange={setAddOpen} />
      <PayslipUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  )
}
