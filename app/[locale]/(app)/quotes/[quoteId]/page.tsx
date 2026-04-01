import { QuoteDetail } from "@/components/invoicing/quote-detail"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

export default async function QuoteDetailPage({ params }: { params: Promise<{ locale: string; quoteId: string }> }) {
  const { locale, quoteId } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const quote = await trpc.quotes.getById({ id: quoteId })
  if (!quote) notFound()

  return (
    <div className="max-w-4xl">
      <QuoteDetail quote={quote} />
    </div>
  )
}
