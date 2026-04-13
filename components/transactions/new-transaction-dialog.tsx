
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import type { Category, Currency, Project } from "@/lib/db-types"
import TransactionCreateForm from "./create"
import { getNewTransactionFormDataAction } from "@/actions/transactions"

/**
 * Self-contained dialog that fetches its own data on mount.
 * Never rendered during SSR — mounted on demand from TransactionsToolbar.
 */
export function NewTransactionDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{
    categories: Category[]
    currencies: Currency[]
    settings: Record<string, string>
    projects: Project[]
  } | null>(null)

  useEffect(() => {
    getNewTransactionFormDataAction().then(setData)
  }, [])

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">New Transaction</DialogTitle>
          <DialogDescription>Create a new transaction</DialogDescription>
        </DialogHeader>
        {data ? (
          <TransactionCreateForm
            categories={data.categories}
            currencies={data.currencies}
            settings={data.settings}
            projects={data.projects}
          />
        ) : (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
