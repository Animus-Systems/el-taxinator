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
import { TemplatesManagerDialog } from "@/components/invoicing/templates-manager-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Sparkles, FileText, Receipt, ChevronDown } from "lucide-react"
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
  const [newKind, setNewKind] = useState<"invoice" | "simplified" | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

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
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            {t("template.manage", { defaultValue: "Templates" })}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles /> <span className="hidden md:block">{t("uploadExternal.trigger")}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                <span className="hidden md:block">{t("newShort", { defaultValue: "New" })}</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="pb-1 text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                {t("newMenu.label", { defaultValue: "Create new" })}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setNewKind("invoice")}>
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex flex-col items-start">
                  <span>{t("newMenu.invoice", { defaultValue: "Invoice (factura)" })}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("newMenu.invoiceHint", { defaultValue: "Full B2B invoice — F-series" })}
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNewKind("simplified")}>
                <Receipt className="mr-2 h-4 w-4" />
                <div className="flex flex-col items-start">
                  <span>{t("newMenu.simplified", { defaultValue: "Simplified invoice (ticket)" })}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("newMenu.simplifiedHint", {
                      defaultValue: "≤ €400, or ≤ €3k retail — R-series",
                    })}
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main>
        <InvoiceList invoices={invoiceList} onCreateNew={() => setNewKind("invoice")} />
      </main>
      <NewInvoiceDialog
        open={newKind !== null}
        onOpenChange={(next) => {
          if (!next) setNewKind(null)
        }}
        kind={newKind ?? "invoice"}
      />
      <ImportInvoicesDialog open={importOpen} onOpenChange={setImportOpen} />
      <TemplatesManagerDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </>
  )
}
