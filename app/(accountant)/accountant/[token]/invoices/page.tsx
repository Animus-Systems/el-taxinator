import { AccountantCommentBox } from "@/components/accountant/comment-box"
import { getAccountantInviteByToken } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { getInvoices } from "@/models/invoices"
import { format } from "date-fns"
import { notFound } from "next/navigation"

export const metadata = { title: "Invoices — Accountant View" }

function statusColor(status: string) {
  switch (status) {
    case "paid": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    case "sent": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    case "overdue": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    case "cancelled": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
    default: return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
  }
}

export default async function AccountantInvoicesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) notFound()

  const permissions = invite.permissions as AccountantPermissions
  if (!permissions.invoices) notFound()

  const invoices = await getInvoices(invite.userId)

  const totalNet = invoices.reduce((sum, inv) => {
    const net = inv.items.reduce((s, item) => s + item.unitPrice * item.quantity, 0)
    return sum + net
  }, 0)

  const totalVat = invoices.reduce((sum, inv) => {
    const vat = inv.items.reduce((s, item) => s + item.unitPrice * item.quantity * (item.vatRate / 100), 0)
    return sum + vat
  }, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Invoices</h1>
      <div className="flex gap-6 mb-6 text-sm text-muted-foreground">
        <span>{invoices.length} invoices</span>
        <span>Net: <strong className="text-foreground">€{(totalNet / 100).toFixed(2)}</strong></span>
        <span>VAT: <strong className="text-foreground">€{(totalVat / 100).toFixed(2)}</strong></span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Number</th>
              <th className="text-left px-4 py-2 font-medium">Client</th>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Due</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Net</th>
              <th className="text-right px-4 py-2 font-medium">VAT</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const net = inv.items.reduce((s, item) => s + item.unitPrice * item.quantity, 0)
              const vat = inv.items.reduce((s, item) => s + item.unitPrice * item.quantity * (item.vatRate / 100), 0)
              const total = net + vat
              return (
                <tr key={inv.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs">{inv.number}</td>
                  <td className="px-4 py-2">{inv.client?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{format(inv.issueDate, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {inv.dueDate ? format(inv.dueDate, "yyyy-MM-dd") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">€{(net / 100).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono">€{(vat / 100).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">€{(total / 100).toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No invoices found.</p>
        )}
      </div>

      <div className="mt-8">
        <AccountantCommentBox inviteId={invite.id} entityType="invoices" entityId="all" token={token} />
      </div>
    </div>
  )
}
