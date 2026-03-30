import { InvoiceForm } from "@/components/invoicing/invoice-form"
import { getCurrentUser } from "@/lib/auth"
import { getClients } from "@/models/clients"
import { getProducts } from "@/models/products"
import { Metadata } from "next"

export const metadata: Metadata = { title: "New Invoice" }

export default async function NewInvoicePage() {
  const user = await getCurrentUser()
  const [clients, products] = await Promise.all([getClients(user.id), getProducts(user.id)])

  return (
    <div className="max-w-4xl">
      <h2 className="text-3xl font-bold tracking-tight mb-8">New Invoice</h2>
      <InvoiceForm clients={clients} products={products} />
    </div>
  )
}
