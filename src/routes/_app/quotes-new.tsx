/**
 * New quote page — SPA equivalent of app/[locale]/(app)/quotes/new/page.tsx
 *
 * Fetches clients and products for the quote form.
 */
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { QuoteForm } from "@/components/invoicing/quote-form"

export function NewQuotePage() {
  const { t } = useTranslation("quotes")

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
      <h2 className="text-3xl font-bold tracking-tight mb-8">{t("newQuote")}</h2>
      <QuoteForm clients={clients ?? []} products={products ?? []} />
    </div>
  )
}
