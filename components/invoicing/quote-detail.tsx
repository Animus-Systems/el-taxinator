"use client"

import { deleteQuoteAction } from "@/actions/quotes"
import { convertQuoteToInvoiceAction } from "@/actions/invoices"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { QuoteWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react"
import { Link, useRouter } from "@/lib/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

export function QuoteDetail({
  quote,
}: {
  quote: QuoteWithRelations
}) {
  const router = useRouter()
  const t = useTranslations("quotes")
  const [isPending, startTransition] = useTransition()
  const { subtotal, vatTotal, total } = calcInvoiceTotals(quote.items)

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return
    startTransition(async () => {
      const result = await deleteQuoteAction(null, quote.id)
      if (result.success) {
        toast.success(t("quoteDeleted"))
        router.push("/quotes")
      } else {
        toast.error(result.error || t("failedToDelete"))
      }
    })
  }

  function handleConvert() {
    const invoiceNumber = prompt(
      t("enterInvoiceNumber"),
      `F-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-001`
    )
    if (!invoiceNumber) return
    const formData = new FormData()
    formData.set("quoteId", quote.id)
    formData.set("invoiceNumber", invoiceNumber)
    startTransition(async () => {
      const result = await convertQuoteToInvoiceAction(null, formData)
      if (result.success && result.data) {
        toast.success(t("quoteConverted"))
        router.push(`/invoices/${result.data.id}`)
      } else {
        toast.error(result.error || t("failedToConvert"))
      }
    })
  }

  const canConvert = quote.status !== "converted" && !quote.invoice

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-2xl font-bold">{quote.number}</h2>
          <Badge>{quote.status}</Badge>
        </div>
        <div className="flex gap-2">
          {canConvert && (
            <Button variant="outline" onClick={handleConvert} disabled={isPending}>
              <ArrowRight className="h-4 w-4 mr-1" /> {t("convertToInvoice")}
            </Button>
          )}
          {quote.invoice && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${quote.invoice.id}`}>{t("viewInvoice")}</Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6 border rounded-lg">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Client</p>
          <p className="font-medium">{quote.client?.name || "—"}</p>
          {quote.client?.taxId && <p className="text-sm text-muted-foreground">NIF: {quote.client.taxId}</p>}
          {quote.client?.email && <p className="text-sm">{quote.client.email}</p>}
        </div>
        <div className="space-y-1 text-right">
          <div>
            <p className="text-sm text-muted-foreground">{t("issueDate")}</p>
            <p className="font-medium">{format(quote.issueDate, "dd/MM/yyyy")}</p>
          </div>
          {quote.expiryDate && (
            <div>
              <p className="text-sm text-muted-foreground">{t("expiryDate")}</p>
              <p className="font-medium">{format(quote.expiryDate, "dd/MM/yyyy")}</p>
            </div>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("description")}</TableHead>
            <TableHead className="text-right">{t("qty")}</TableHead>
            <TableHead className="text-right">{t("unitPrice")}</TableHead>
            <TableHead className="text-right">{t("vatPercent")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quote.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.description}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.unitPrice, "EUR")}</TableCell>
              <TableCell className="text-right">{item.vatRate}%</TableCell>
              <TableCell className="text-right">{formatCurrency(item.quantity * item.unitPrice, "EUR")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>{t("subtotal")}</TableCell>
            <TableCell className="text-right">{formatCurrency(subtotal, "EUR")}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={4}>{t("vat")}</TableCell>
            <TableCell className="text-right">{formatCurrency(vatTotal, "EUR")}</TableCell>
          </TableRow>
          <TableRow className="font-bold">
            <TableCell colSpan={4}>{t("total")}</TableCell>
            <TableCell className="text-right">{formatCurrency(total, "EUR")}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {quote.notes && (
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{t("notes")}</p>
          <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  )
}
