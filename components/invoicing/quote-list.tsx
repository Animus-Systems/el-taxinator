"use client"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { Client, Quote, QuoteItem } from "@/prisma/client"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import Link from "next/link"
import { Eye } from "lucide-react"

type QuoteWithRelations = Quote & { client: Client | null; items: QuoteItem[] }

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  sent: "default",
  accepted: "outline",
  rejected: "destructive",
  converted: "secondary",
}

export function QuoteList({ quotes }: { quotes: QuoteWithRelations[] }) {
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>No quotes yet.</p>
        <Button asChild>
          <Link href="/quotes/new">Create your first quote</Link>
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
          <TableHead>Expiry Date</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((quote) => {
          const { total } = calcInvoiceTotals(quote.items)
          return (
            <TableRow key={quote.id}>
              <TableCell className="font-medium">{quote.number}</TableCell>
              <TableCell>{quote.client?.name || "—"}</TableCell>
              <TableCell>{format(quote.issueDate, "yyyy-MM-dd")}</TableCell>
              <TableCell>{quote.expiryDate ? format(quote.expiryDate, "yyyy-MM-dd") : "—"}</TableCell>
              <TableCell>{formatCurrency(total, "EUR")}</TableCell>
              <TableCell>
                <Badge variant={STATUS_COLORS[quote.status] ?? "secondary"}>{quote.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="icon">
                  <Link href={`/quotes/${quote.id}`}>
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
