
import { useState } from "react"
import { useTranslations } from "next-intl"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Download, Loader2, Plus, Sparkles } from "lucide-react"
import { ExportTransactionsDialog } from "@/components/export/transactions"
import type { BankAccount, Category, Field, Project } from "@/lib/db-types"
import { trpc } from "~/trpc"

type Props = {
  accounts: BankAccount[]
  categories: Category[]
  projects: Project[]
  fields: Field[]
  total: number
}

/**
 * Transactions header toolbar. "Add transaction" and "AI import" both route
 * into the unified wizard — manual entry creates a blank wizard session via
 * tRPC, file import lands on /wizard/new's upload zone.
 */
export function TransactionsToolbar({ accounts: _accounts, categories, projects, fields, total }: Props) {
  const t = useTranslations("transactions")
  const navigate = useNavigate()
  const [activeDialog, setActiveDialog] = useState<"export" | null>(null)

  const startManual = trpc.wizard.startManual.useMutation({
    onSuccess: ({ sessionId }) => {
      navigate({ to: `/wizard/${sessionId}` as string })
    },
  })

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
        <Button onClick={() => startManual.mutate({ accountId: null })} disabled={startManual.isPending}>
          {startManual.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          <span className="hidden md:block">{t("addTransaction")}</span>
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
