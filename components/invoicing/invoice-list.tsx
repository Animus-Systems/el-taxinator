
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import { useTranslations } from "next-intl"
import { Eye } from "lucide-react"

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  sent: "default",
  paid: "outline",
  overdue: "destructive",
  cancelled: "secondary",
}

export function InvoiceList({ invoices }: { invoices: InvoiceWithRelations[] }) {
  const t = useTranslations("invoices")
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
                <Button asChild variant="ghost" size="icon">
                  <Link href={`/invoices/${invoice.id}`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
