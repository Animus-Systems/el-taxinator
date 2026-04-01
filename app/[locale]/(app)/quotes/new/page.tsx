import { QuoteForm } from "@/components/invoicing/quote-form"
import { serverClient } from "@/lib/trpc/server-client"
import { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "New Quote" }

export default async function NewQuotePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [clients, products] = await Promise.all([trpc.clients.list({}), trpc.products.list({})])

  return (
    <div className="max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">New Quote</h2>
      <QuoteForm clients={clients} products={products} />
    </div>
  )
}
