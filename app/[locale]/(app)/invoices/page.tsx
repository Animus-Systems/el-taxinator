import { InvoiceList } from "@/components/invoicing/invoice-list"
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
  const t = await getTranslations({ locale, namespace: "invoices" })
  return { title: t("title") }
}

export default async function InvoicesPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "invoices" })
  const tQuotes = await getTranslations({ locale, namespace: "quotes" })
  const trpc = await serverClient()
  const invoices = await trpc.invoices.list({})

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{invoices.length}</span>
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/quotes">{tQuotes("title")}</Link>
          </Button>
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> <span className="hidden md:block">{t("newInvoice")}</span>
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
