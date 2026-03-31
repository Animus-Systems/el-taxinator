import { InvoiceDetail } from "@/components/invoicing/invoice-detail"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { notFound } from "next/navigation"

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(invoiceId, user.id)
  if (!invoice) notFound()

  return (
    <div className="max-w-4xl">
      <InvoiceDetail invoice={invoice} />
    </div>
  )
}
