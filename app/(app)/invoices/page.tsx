import { InvoiceList } from "@/components/invoicing/invoice-list"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getInvoices } from "@/models/invoices"
import { Plus } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Invoices",
  description: "Manage your invoices",
}

export default async function InvoicesPage() {
  const user = await getCurrentUser()
  const invoices = await getInvoices(user.id)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Invoices</span>
          <span className="text-3xl tracking-tight opacity-20">{invoices.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/quotes">Quotes</Link>
          </Button>
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> <span className="hidden md:block">New Invoice</span>
            </Link>
          </Button>
        </div>
      </header>
      <main>
        <InvoiceList invoices={invoices} />
      </main>
    </>
  )
}
