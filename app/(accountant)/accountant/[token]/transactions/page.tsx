import { AccountantCommentBox } from "@/components/accountant/comment-box"
import { getAccountantInviteByToken } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { getTransactions } from "@/models/transactions"
import { format } from "date-fns"
import { notFound } from "next/navigation"

export const metadata = { title: "Transactions — Accountant View" }

export default async function AccountantTransactionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) notFound()

  const permissions = invite.permissions as AccountantPermissions
  if (!permissions.transactions) notFound()

  const { transactions } = await getTransactions(invite.userId, {}, { limit: 500, offset: 0 })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Name / Merchant</th>
              <th className="text-left px-4 py-2 font-medium">Category</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
              <th className="text-left px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                  {tx.issuedAt ? format(new Date(tx.issuedAt), "yyyy-MM-dd") : "—"}
                </td>
                <td className="px-4 py-2 font-medium">{tx.name ?? tx.merchant ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{tx.categoryCode ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tx.type === "income" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  }`}>
                    {tx.type ?? "expense"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {tx.total != null
                    ? `${(tx.total / 100).toFixed(2)} ${tx.currencyCode ?? ""}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs max-w-xs truncate">{tx.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No transactions found.</p>
        )}
      </div>

      <div className="mt-8">
        <AccountantCommentBox inviteId={invite.id} entityType="transactions" entityId="all" token={token} />
      </div>
    </div>
  )
}
