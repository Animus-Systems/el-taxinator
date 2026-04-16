
import { useState } from "react"
import { useTranslations } from "next-intl"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Download, Sparkles } from "lucide-react"
import { ExportTransactionsDialog } from "@/components/export/transactions"
import type { BankAccount, Category, Field, Project } from "@/lib/db-types"

type Props = {
  accounts: BankAccount[]
  categories: Category[]
  projects: Project[]
  fields: Field[]
  total: number
}

/**
 * Transactions header toolbar. Entry points: run the wizard (AI import) or
 * export the filtered list. New manual entry happens inside the wizard itself.
 */
export function TransactionsToolbar({ accounts: _accounts, categories, projects, fields, total }: Props) {
  const t = useTranslations("transactions")
  const navigate = useNavigate()
  const [activeDialog, setActiveDialog] = useState<"export" | null>(null)

  const close = () => setActiveDialog(null)

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/wizard/new" as string })}>
          <Sparkles /> <span className="hidden md:block">{t("aiImport")}</span>
        </Button>
        <Button variant="outline" onClick={() => setActiveDialog("export")}>
          <Download /> <span className="hidden md:block">{t("export")}</span>
        </Button>
      </div>

      {activeDialog === "export" && (
        <ExportTransactionsDialog
          fields={fields}
          categories={categories}
          projects={projects}
          total={total}
          onClose={close}
        />
      )}
    </>
  )
}
