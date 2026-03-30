"use client"

import { deleteQuoteAction } from "@/app/(app)/quotes/actions"
import { convertQuoteToInvoiceAction } from "@/app/(app)/invoices/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/models/invoices"
import { formatCurrency } from "@/lib/utils"
import { Client, Invoice, Product, Quote, QuoteItem } from "@/prisma/client"
import { format } from "date-fns"
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

type QuoteWithRelations = Quote & {
  client: Client | null
  items: (QuoteItem & { product: Product | null })[]
  invoice: Invoice | null
}

export function QuoteDetail({
  quote,
  clients,
  products,
}: {
  quote: QuoteWithRelations
  clients: Client[]
  products: Product[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { subtotal, vatTotal, total } = calcInvoiceTotals(quote.items)

  async function handleDelete() {
    if (!confirm("Delete this quote?")) return
    startTransition(async () => {
      const result = await deleteQuoteAction(null, quote.id)
      if (result.success) {
        toast.success("Quote deleted")
        router.push("/quotes")
      } else {
        toast.error(result.error || "Failed to delete quote")
      }
    })
  }

  function handleConvert() {
    const invoiceNumber = prompt(
      "Enter invoice number:",
      `F-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-001`
    )
    if (!invoiceNumber) return
    const formData = new FormData()
    formData.set("quoteId", quote.id)
    formData.set("invoiceNumber", invoiceNumber)
    startTransition(async () => {
      const result = await convertQuoteToInvoiceAction(null, formData)
      if (result.success && result.data) {
        toast.success("Quote converted to invoice")
        router.push(`/invoices/${result.data.id}`)
      } else {
        toast.error(result.error || "Failed to convert quote")
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
              <ArrowRight className="h-4 w-4 mr-1" /> Convert to Invoice
            </Button>
          )}
          {quote.invoice && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${quote.invoice.id}`}>View Invoice</Link>
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
            <p className="text-sm text-muted-foreground">Issue Date</p>
            <p className="font-medium">{format(quote.issueDate, "dd/MM/yyyy")}</p>
          </div>
          {quote.expiryDate && (
            <div>
              <p className="text-sm text-muted-foreground">Expiry Date</p>
              <p className="font-medium">{format(quote.expiryDate, "dd/MM/yyyy")}</p>
            </div>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">VAT %</TableHead>
            <TableHead className="text-right">Amount</TableHead>
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
            <TableCell colSpan={4}>Subtotal</TableCell>
            <TableCell className="text-right">{formatCurrency(subtotal, "EUR")}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={4}>VAT</TableCell>
            <TableCell className="text-right">{formatCurrency(vatTotal, "EUR")}</TableCell>
          </TableRow>
          <TableRow className="font-bold">
            <TableCell colSpan={4}>Total</TableCell>
            <TableCell className="text-right">{formatCurrency(total, "EUR")}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {quote.notes && (
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  )
}
