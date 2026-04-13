/**
 * Quote detail page — SPA equivalent of app/[locale]/(app)/quotes/[quoteId]/page.tsx
 *
 * Fetches a single quote by ID from the URL and renders QuoteDetail.
 */
import { useParams } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { QuoteDetail } from "@/components/invoicing/quote-detail"

export function QuoteDetailPage() {
  const { quoteId } = useParams({ strict: false }) as { quoteId: string }

  const { data: quote, isLoading } = trpc.quotes.getById.useQuery(
    { id: quoteId },
    { enabled: !!quoteId },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Quote not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <QuoteDetail quote={quote} />
    </div>
  )
}
