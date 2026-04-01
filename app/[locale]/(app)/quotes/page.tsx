import { QuoteList } from "@/components/invoicing/quote-list"
import { Button } from "@/components/ui/button"
import { serverClient } from "@/lib/trpc/server-client"
import { Plus } from "lucide-react"
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server"
import { Metadata } from "next"
import { Link } from "@/lib/navigation"

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "quotes" })
  return { title: t("title") }
}

export default async function QuotesPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "quotes" })
  const tInvoices = await getTranslations({ locale, namespace: "invoices" })
  const trpc = await serverClient()
  const quotes = await trpc.quotes.list({})

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{quotes.length}</span>
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
        <QuoteList quotes={quotes} />
      </main>
    </>
  )
}
