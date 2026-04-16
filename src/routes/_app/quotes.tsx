/**
 * Quotes page — SPA equivalent of app/[locale]/(app)/quotes/page.tsx
 *
 * Fetches quotes list via tRPC and renders QuoteList.
 */
import { useTranslation } from "react-i18next"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { QuoteList } from "@/components/invoicing/quote-list"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { Link } from "@/lib/navigation"

type QuoteItem = ComponentProps<typeof QuoteList>["quotes"][number]

function normalizeQuote(q: {
  invoice?: unknown
  [x: string]: unknown
}): QuoteItem {
  const { invoice, ...rest } = q
  const base = rest as Omit<QuoteItem, "invoice">
  return invoice !== undefined
    ? ({ ...base, invoice } as QuoteItem)
    : (base as QuoteItem)
}

export function QuotesPage() {
  const { t } = useTranslation("quotes")
  const { t: tInvoices } = useTranslation("invoices")

  const { data: quotes, isLoading } = trpc.quotes.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const quoteList = (quotes ?? []).map(normalizeQuote)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{quoteList.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/invoices">{tInvoices("title")}</Link>
          </Button>
          <Button asChild>
            <Link href="/quotes/new">
              <Plus /> <span className="hidden md:block">{t("newQuote")}</span>
            </Link>
          </Button>
        </div>
      </header>
      <main>
        <QuoteList quotes={quoteList} />
      </main>
    </>
  )
}
