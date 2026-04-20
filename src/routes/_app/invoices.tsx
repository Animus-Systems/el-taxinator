/**
 * Invoices list page — SPA equivalent of app/[locale]/(app)/invoices/page.tsx
 *
 * Fetches invoices via tRPC and renders InvoiceList.
 */
import { useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { InvoiceList } from "@/components/invoicing/invoice-list"
import { ImportInvoicesDialog } from "@/components/invoicing/import-invoices-dialog"
import { NewInvoiceDialog } from "@/components/invoicing/new-invoice-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Sparkles } from "lucide-react"
import { Link } from "@/lib/navigation"

type InvoiceItem = ComponentProps<typeof InvoiceList>["invoices"][number]

function normalizeInvoice(inv: {
  quote?: unknown
  [x: string]: unknown
}): InvoiceItem {
  const { quote, ...rest } = inv
  const base = rest as Omit<InvoiceItem, "quote">
  return quote !== undefined
    ? ({ ...base, quote } as InvoiceItem)
    : (base as InvoiceItem)
}

export function InvoicesPage() {
  const { t } = useTranslation("invoices")
  const { t: tQuotes } = useTranslation("quotes")
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { data: invoices, isLoading } = trpc.invoices.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const invoiceList = (invoices ?? []).map(normalizeInvoice)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{invoiceList.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/quotes">{tQuotes("title")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reconcile">{t("reconcile.trigger")}</Link>
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles /> <span className="hidden md:block">{t("uploadExternal.trigger")}</span>
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus /> <span className="hidden md:block">{t("newInvoice")}</span>
          </Button>
        </div>
      </header>
      <main>
        <InvoiceList invoices={invoiceList} onCreateNew={() => setNewOpen(true)} />
      </main>
      <NewInvoiceDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportInvoicesDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
