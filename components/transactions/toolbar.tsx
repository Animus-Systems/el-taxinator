
import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Download, Import, Plus } from "lucide-react"
import { AIImportDialog } from "@/components/import/import-dialog"
import { ExportTransactionsDialog } from "@/components/export/transactions"
import { NewTransactionDialog } from "@/components/transactions/new-transaction-dialog"
import type { BankAccount, Category, Field, Project } from "@/lib/db-types"

type Props = {
  accounts: BankAccount[]
  categories: Category[]
  projects: Project[]
  fields: Field[]
  total: number
}

/**
 * Client component that renders header action buttons and mounts dialogs
 * only on demand — never during SSR, eliminating Radix hydration mismatches.
 */
export function TransactionsToolbar({ accounts, categories, projects, fields, total }: Props) {
  const t = useTranslations("transactions")
  const [activeDialog, setActiveDialog] = useState<"import" | "export" | "new" | null>(null)

  const close = () => setActiveDialog(null)

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setActiveDialog("import")}>
          <Import /> <span className="hidden md:block">{t("aiImport")}</span>
        </Button>
        <Button variant="outline" onClick={() => setActiveDialog("export")}>
          <Download /> <span className="hidden md:block">{t("export")}</span>
        </Button>
        <Button onClick={() => setActiveDialog("new")}>
          <Plus /> <span className="hidden md:block">{t("addTransaction")}</span>
        </Button>
      </div>

      {/* Dialogs mount only when opened — no SSR, no hydration issues */}
      {activeDialog === "import" && (
        <AIImportDialog accounts={accounts} onClose={close} />
      )}
      {activeDialog === "export" && (
        <ExportTransactionsDialog
          fields={fields}
          categories={categories}
          projects={projects}
          total={total}
          onClose={close}
        />
      )}
      {activeDialog === "new" && (
        <NewTransactionDialog onClose={close} />
      )}
    </>
  )
}
