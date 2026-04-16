/**
 * New invoice page — SPA equivalent of app/[locale]/(app)/invoices/new/page.tsx
 *
 * Fetches clients and products for the invoice form.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { InvoiceForm } from "@/components/invoicing/invoice-form"

export function NewInvoicePage() {
  const { t } = useTranslation("invoices")

  const { data: clients, isLoading: clientsLoading } = trpc.clients.list.useQuery({})
  const { data: products, isLoading: productsLoading } = trpc.products.list.useQuery({})

  if (clientsLoading || productsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">{t("newInvoice")}</h2>
      <InvoiceForm
        clients={clients ?? []}
        products={products ?? []}
      />
    </div>
  )
}
