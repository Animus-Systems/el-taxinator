/**
 * Compute invoice / purchase / quote totals from line items.
 *
 * When `totalOverride` is provided (non-null), it wins as the final total and
 * VAT is derived as `override − subtotal`. Used by invoices where the printed
 * final amount (e.g. €60.00 at 7% VAT) cannot be represented exactly by
 * integer-cent `preTax × 1.07` arithmetic. Storing the authoritative total on
 * the invoice and computing VAT as `total − subtotal` preserves the value the
 * user (or their issuing software) put on the PDF.
 *
 * When `totalOverride` is null / undefined, behavior is identical to before:
 * `subtotal` is the sum of item amounts, `vatTotal` applies the per-item rate,
 * `total` is their sum.
 */
export function calcInvoiceTotals(
  items: { quantity: number; unitPrice: number; vatRate: number }[],
  totalOverride?: number | null,
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  if (totalOverride !== null && totalOverride !== undefined) {
    const total = totalOverride
    const vatTotal = Math.max(total - subtotal, 0)
    return { subtotal, vatTotal, total }
  }
  const vatTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.vatRate / 100), 0)
  const total = subtotal + vatTotal
  return { subtotal, vatTotal, total }
}
