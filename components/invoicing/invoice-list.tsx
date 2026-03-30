"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/models/invoices"
import { Client, Invoice, InvoiceItem } from "@/prisma/client"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import Link from "next/link"
import { Eye } from "lucide-react"

type InvoiceWithRelations = Invoice & { client: Client | null; items: InvoiceItem[] }

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  sent: "default",
  paid: "outline",
  overdue: "destructive",
  cancelled: "secondary",
}

export function InvoiceList({ invoices }: { invoices: InvoiceWithRelations[] }) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>No invoices yet.</p>
        <Button asChild>
          <Link href="/invoices/new">Create your first invoice</Link>
        </Button>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Issue Date</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
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
                <Badge variant={STATUS_COLORS[invoice.status] as any}>{invoice.status}</Badge>
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
