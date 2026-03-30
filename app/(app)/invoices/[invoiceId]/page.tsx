import { InvoiceDetail } from "@/components/invoicing/invoice-detail"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getInvoiceById } from "@/models/invoices"
import { getProducts } from "@/models/products"
import { notFound } from "next/navigation"

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  const user = await getCurrentUser()
  const [invoice, clients, products] = await Promise.all([
    getInvoiceById(invoiceId, user.id),
    getClients(user.id),
    getProducts(user.id),
  ])
  if (!invoice) notFound()

  return (
    <div className="max-w-4xl">
      <InvoiceDetail invoice={invoice} clients={clients} products={products} />
    </div>
  )
}
