/**
 * AI Import settings page — tabbed entry point for bank statements and
 * vendor receipts / supplier invoices.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { ImportUpload } from "@/components/import/import-upload"
import { ReceiptsUpload } from "@/components/receipts/receipts-upload"
import { cn } from "@/lib/utils"

type Tab = "bank" | "receipts"

export function ImportSettingsPage() {
  const { t } = useTranslation("settings")
  const { t: tTx } = useTranslation("transactions")
  const [tab, setTab] = useState<Tab>("bank")

  const { data: accounts, isLoading } = trpc.accounts.listActive.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">{t("aiImportTitle")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">
        {t("aiImportDesc")}
      </p>

      <div className="mb-4 inline-flex rounded-md border bg-muted/40 p-1">
        <button
          type="button"
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "bank"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("bank")}
        >
          {tTx("receipts.bankStatementsTab")}
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "receipts"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("receipts")}
        >
          {tTx("receipts.receiptsTab")}
        </button>
      </div>

      {tab === "bank" ? (
        <ImportUpload accounts={accounts ?? []} />
      ) : (
        <ReceiptsUpload />
      )}
    </div>
  )
}
