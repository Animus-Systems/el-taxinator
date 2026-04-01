"use client"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { QuoteWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { Link } from "@/lib/navigation"
import { useTranslations } from "next-intl"
import { Eye } from "lucide-react"

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  sent: "default",
  accepted: "outline",
  rejected: "destructive",
  converted: "secondary",
}

export function QuoteList({ quotes }: { quotes: QuoteWithRelations[] }) {
  const t = useTranslations("quotes")
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{t("noQuotes")}</p>
        <Button asChild>
          <Link href="/quotes/new">{t("createFirst")}</Link>
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
          <TableHead>{t("expiryDate")}</TableHead>
          <TableHead>{t("total")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead className="text-right">{t("actions")}</TableHead>
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
