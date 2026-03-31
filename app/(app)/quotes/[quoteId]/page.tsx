import { QuoteDetail } from "@/components/invoicing/quote-detail"
import { getCurrentUser } from "@/lib/auth"
import { getQuoteById } from "@/models/invoices"
import { notFound } from "next/navigation"

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  const user = await getCurrentUser()
  const quote = await getQuoteById(quoteId, user.id)
  if (!quote) notFound()

  return (
    <div className="max-w-4xl">
      <QuoteDetail quote={quote} />
    </div>
  )
}
