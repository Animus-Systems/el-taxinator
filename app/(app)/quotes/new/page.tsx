import { QuoteForm } from "@/components/invoicing/quote-form"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getProducts } from "@/models/products"
import { Metadata } from "next"

export const metadata: Metadata = { title: "New Quote" }

export default async function NewQuotePage() {
  const user = await getCurrentUser()
  const [clients, products] = await Promise.all([getClients(user.id), getProducts(user.id)])

  return (
    <div className="max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">New Quote</h2>
      <QuoteForm clients={clients} products={products} />
    </div>
  )
}
