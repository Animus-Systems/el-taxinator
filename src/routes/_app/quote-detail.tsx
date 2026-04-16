/**
 * Quote detail page — SPA equivalent of app/[locale]/(app)/quotes/[quoteId]/page.tsx
 *
 * Fetches a single quote by ID from the URL and renders QuoteDetail.
 */
import { useParams } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { QuoteDetail } from "@/components/invoicing/quote-detail"

type QuoteProp = ComponentProps<typeof QuoteDetail>["quote"]

function normalizeQuote(q: {
  invoice?: unknown
  [x: string]: unknown
}): QuoteProp {
  const { invoice, ...rest } = q
  const base = rest as Omit<QuoteProp, "invoice">
  return invoice !== undefined
    ? ({ ...base, invoice } as QuoteProp)
    : (base as QuoteProp)
}

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
      <QuoteDetail quote={normalizeQuote(quote)} />
    </div>
  )
}
