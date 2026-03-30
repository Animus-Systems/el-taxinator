import { QuoteDetail } from "@/components/invoicing/quote-detail"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getQuoteById } from "@/models/invoices"
import { getProducts } from "@/models/products"
import { notFound } from "next/navigation"

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  const user = await getCurrentUser()
  const [quote, clients, products] = await Promise.all([
    getQuoteById(quoteId, user.id),
    getClients(user.id),
    getProducts(user.id),
  ])
  if (!quote) notFound()

  return (
    <div className="max-w-4xl">
      <QuoteDetail quote={quote} clients={clients} products={products} />
    </div>
  )
}
