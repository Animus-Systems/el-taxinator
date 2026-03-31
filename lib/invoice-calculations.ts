export function calcInvoiceTotals(items: { quantity: number; unitPrice: number; vatRate: number }[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const vatTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.vatRate / 100), 0)
  const total = subtotal + vatTotal

  return { subtotal, vatTotal, total }
}
