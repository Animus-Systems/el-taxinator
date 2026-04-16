/**
 * Invoices list page — SPA equivalent of app/[locale]/(app)/invoices/page.tsx
 *
 * Fetches invoices via tRPC and renders InvoiceList.
 */
import { useTranslation } from "react-i18next"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { InvoiceList } from "@/components/invoicing/invoice-list"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
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
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> <span className="hidden md:block">{t("newInvoice")}</span>
            </Link>
          </Button>
        </div>
      </header>
      <main>
        <InvoiceList invoices={invoiceList} />
      </main>
    </>
  )
}
