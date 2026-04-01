import { InvoiceForm } from "@/components/invoicing/invoice-form"
import { serverClient } from "@/lib/trpc/server-client"
import { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "New Invoice" }

export default async function NewInvoicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const [clients, products, timeEntries] = await Promise.all([
    trpc.clients.list({}),
    trpc.products.list({}),
    trpc.timeEntries.list({ isBillable: true, isInvoiced: false }),
  ])

  return (
    <div className="max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">New Invoice</h2>
      <InvoiceForm clients={clients} products={products} timeEntries={timeEntries} />
    </div>
  )
}
