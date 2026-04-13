/**
 * Invoice detail page — SPA equivalent of app/[locale]/(app)/invoices/[invoiceId]/page.tsx
 *
 * Fetches a single invoice by ID from the URL and renders InvoiceDetail.
 */
import { useParams } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { InvoiceDetail } from "@/components/invoicing/invoice-detail"

export function InvoiceDetailPage() {
  const { invoiceId } = useParams({ strict: false }) as { invoiceId: string }

  const { data: invoice, isLoading } = trpc.invoices.getById.useQuery(
    { id: invoiceId },
    { enabled: !!invoiceId },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Invoice not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <InvoiceDetail invoice={invoice} />
    </div>
  )
}
