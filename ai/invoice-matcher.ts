import type { InvoiceWithRelations } from "@/models/invoices"
import type { TransactionData } from "@/models/transactions"

export type InvoiceMatch = {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  confidence: "high" | "medium" | "low"
  reason: string
}

/**
 * Attempts to match a transaction (from bank statement) to existing invoices.
 * Matches by amount, date proximity, and client/merchant name similarity.
 */
export function findInvoiceMatches(
  transaction: TransactionData,
  invoices: InvoiceWithRelations[],
): InvoiceMatch[] {
  const matches: InvoiceMatch[] = []
  const txTotal = Math.abs(transaction.total ?? 0)
  const txDate = transaction.issuedAt ? new Date(transaction.issuedAt) : null
  const txMerchant = (transaction.merchant ?? transaction.name ?? "").toLowerCase()

  for (const invoice of invoices) {
    // Skip non-sent/paid invoices
    if (!["sent", "paid"].includes(invoice.status)) continue

    // Calculate invoice total
    const subtotal = invoice.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const igic = invoice.items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0)
    const irpf = subtotal * ((invoice.irpfRate ?? 0) / 100)
    const invoiceTotal = Math.abs(subtotal + igic - irpf)

    // Amount match (within 1% tolerance for rounding)
    const amountDiff = Math.abs(txTotal - invoiceTotal)
    const amountMatch = invoiceTotal > 0 && amountDiff / invoiceTotal < 0.01

    // Date proximity (within 30 days)
    let dateMatch = false
    let dateDays = Infinity
    if (txDate && invoice.issueDate) {
      dateDays = Math.abs(txDate.getTime() - new Date(invoice.issueDate).getTime()) / (1000 * 60 * 60 * 24)
      dateMatch = dateDays <= 30
    }

    // Client/merchant name similarity
    const clientName = (invoice.client?.name ?? "").toLowerCase()
    const nameMatch = clientName && txMerchant && (
      txMerchant.includes(clientName) || clientName.includes(txMerchant)
    )

    // Score the match
    if (amountMatch && nameMatch) {
      matches.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        clientName: invoice.client?.name ?? "",
        confidence: "high",
        reason: `Amount matches (${(invoiceTotal / 100).toFixed(2)}) and client name matches`,
      })
    } else if (amountMatch && dateMatch) {
      matches.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        clientName: invoice.client?.name ?? "",
        confidence: "medium",
        reason: `Amount matches (${(invoiceTotal / 100).toFixed(2)}), date within ${Math.round(dateDays)} days`,
      })
    } else if (amountMatch) {
      matches.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        clientName: invoice.client?.name ?? "",
        confidence: "low",
        reason: `Amount matches (${(invoiceTotal / 100).toFixed(2)})`,
      })
    }
  }

  // Sort by confidence
  const order = { high: 0, medium: 1, low: 2 }
  return matches.sort((a, b) => order[a.confidence] - order[b.confidence])
}
