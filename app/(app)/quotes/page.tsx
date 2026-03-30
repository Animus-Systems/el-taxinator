import { QuoteList } from "@/components/invoicing/quote-list"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getQuotes } from "@/models/invoices"
import { Plus } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Quotes",
  description: "Manage your quotes",
}

export default async function QuotesPage() {
  const user = await getCurrentUser()
  const quotes = await getQuotes(user.id)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Quotes</span>
          <span className="text-3xl tracking-tight opacity-20">{quotes.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/invoices">Invoices</Link>
          </Button>
          <Button asChild>
            <Link href="/quotes/new">
              <Plus /> <span className="hidden md:block">New Quote</span>
            </Link>
          </Button>
        </div>
      </header>
      <main>
        <QuoteList quotes={quotes} />
      </main>
    </>
  )
}
