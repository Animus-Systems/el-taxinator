
import { useState } from "react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import { useTranslations } from "next-intl"
import { Eye, FileText, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { PdfPreviewDialog } from "./pdf-preview-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  sent: "default",
  paid: "outline",
  overdue: "destructive",
  cancelled: "secondary",
}

export function InvoiceList({ invoices }: { invoices: InvoiceWithRelations[] }) {
  const t = useTranslations("invoices")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [preview, setPreview] = useState<{ fileId: string; title: string } | null>(null)
  const deleteInvoice = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate()
      toast.success(t("invoiceDeleted"))
    },
    onError: (err) => {
      toast.error(err.message || t("failedToDeleteInvoice"))
    },
  })

  async function onDelete(id: string) {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    deleteInvoice.mutate({ id })
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{t("noInvoices")}</p>
        <Button asChild>
          <Link href="/invoices/new">{t("createFirst")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("number")}</TableHead>
            <TableHead>{t("client")}</TableHead>
            <TableHead>{t("issueDate")}</TableHead>
            <TableHead>{t("dueDate")}</TableHead>
            <TableHead>{t("total")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const { total } = calcInvoiceTotals(invoice.items)
            return (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.number}</TableCell>
                <TableCell>{invoice.client?.name || "—"}</TableCell>
                <TableCell>{format(invoice.issueDate, "yyyy-MM-dd")}</TableCell>
                <TableCell>{invoice.dueDate ? format(invoice.dueDate, "yyyy-MM-dd") : "—"}</TableCell>
                <TableCell>{formatCurrency(total, "EUR")}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[invoice.status] ?? "secondary"}>{invoice.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {invoice.pdfFileId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t("viewPdf")}
                      onClick={() => {
                        setPreview({
                          fileId: invoice.pdfFileId as string,
                          title: invoice.number,
                        })
                      }}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="icon">
                    <Link href={`/invoices/${invoice.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("deleteInvoice")}
                    title={t("deleteInvoice")}
                    onClick={() => onDelete(invoice.id)}
                    disabled={deleteInvoice.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <PdfPreviewDialog
        open={preview !== null}
        onOpenChange={(next) => {
          if (!next) setPreview(null)
        }}
        fileId={preview?.fileId ?? null}
        title={preview?.title}
      />
    </>
  )
}
