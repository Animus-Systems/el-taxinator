"use client"

import { deleteInvoiceAction, updateInvoiceStatusAction } from "@/actions/invoices"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { ArrowLeft, Download, Trash2 } from "lucide-react"
import { Link, useRouter } from "@/lib/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

const STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const

export function InvoiceDetail({
  invoice,
}: {
  invoice: InvoiceWithRelations
}) {
  const router = useRouter()
  const t = useTranslations("invoices")
  const [isPending, startTransition] = useTransition()
  const { subtotal, vatTotal, total } = calcInvoiceTotals(invoice.items)

  function handleStatusChange(status: string) {
    const formData = new FormData()
    formData.set("invoiceId", invoice.id)
    formData.set("status", status)
    startTransition(async () => {
      const result = await updateInvoiceStatusAction(null, formData)
      if (result.success) {
        toast.success(t("statusUpdated"))
        router.refresh()
      } else {
        toast.error(result.error || t("failedToUpdate"))
      }
    })
  }

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return
    startTransition(async () => {
      const result = await deleteInvoiceAction(null, invoice.id)
      if (result.success) {
        toast.success(t("invoiceDeleted"))
        router.push("/invoices")
      } else {
        toast.error(result.error || t("failedToDeleteInvoice"))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-2xl font-bold">{invoice.number}</h2>
          <Badge>{invoice.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={invoice.status} onValueChange={handleStatusChange} disabled={isPending}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="icon">
            <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
              <Download className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6 border rounded-lg">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Client</p>
          <p className="font-medium">{invoice.client?.name || "—"}</p>
          {invoice.client?.taxId && <p className="text-sm text-muted-foreground">NIF: {invoice.client.taxId}</p>}
          {invoice.client?.address && <p className="text-sm">{invoice.client.address}</p>}
          {invoice.client?.email && <p className="text-sm">{invoice.client.email}</p>}
        </div>
        <div className="space-y-1 text-right">
          <div>
            <p className="text-sm text-muted-foreground">{t("issueDate")}</p>
            <p className="font-medium">{format(invoice.issueDate, "dd/MM/yyyy")}</p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-sm text-muted-foreground">{t("dueDate")}</p>
              <p className="font-medium">{format(invoice.dueDate, "dd/MM/yyyy")}</p>
            </div>
          )}
          {invoice.paidAt && (
            <div>
              <p className="text-sm text-muted-foreground">{t("paid")}</p>
              <p className="font-medium text-green-600">{format(invoice.paidAt, "dd/MM/yyyy")}</p>
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
          {invoice.items.map((item) => (
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
            <TableCell colSpan={4}>{t("iva")}</TableCell>
            <TableCell className="text-right">{formatCurrency(vatTotal, "EUR")}</TableCell>
          </TableRow>
          {invoice.irpfRate > 0 && (
            <TableRow className="text-muted-foreground">
              <TableCell colSpan={4}>{t("irpfRetention", { rate: invoice.irpfRate })}</TableCell>
              <TableCell className="text-right">−{formatCurrency(Math.round(subtotal * invoice.irpfRate / 100), "EUR")}</TableCell>
            </TableRow>
          )}
          <TableRow className="font-bold">
            <TableCell colSpan={4}>{t("totalToPay")}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(total - (invoice.irpfRate > 0 ? Math.round(subtotal * invoice.irpfRate / 100) : 0), "EUR")}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {invoice.notes && (
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{t("notes")}</p>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {invoice.quote && (
        <div className="text-sm text-muted-foreground">
          {t("convertedFromQuote")}{" "}
          <Link href={`/quotes/${invoice.quote.id}`} className="underline">
            {invoice.quote.number}
          </Link>
        </div>
      )}
    </div>
  )
}
