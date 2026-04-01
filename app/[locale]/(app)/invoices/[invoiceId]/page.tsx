import { InvoiceDetail } from "@/components/invoicing/invoice-detail"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

export default async function InvoiceDetailPage({ params }: { params: Promise<{ locale: string; invoiceId: string }> }) {
  const { locale, invoiceId } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const invoice = await trpc.invoices.getById({ id: invoiceId })
  if (!invoice) notFound()

  return (
    <div className="max-w-4xl">
      <InvoiceDetail invoice={invoice} />
    </div>
  )
}
