import { AccountantCommentBox } from "@/components/accountant/comment-box"
import { getAccountantInviteByToken } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { getTimeEntries, calcDurationMinutes } from "@/models/time-entries"
import { format } from "date-fns"
import { notFound } from "next/navigation"

export const metadata = { title: "Time Tracking — Accountant View" }

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default async function AccountantTimePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) notFound()

  const permissions = invite.permissions as AccountantPermissions
  if (!permissions.time) notFound()

  const entries = await getTimeEntries(invite.userId)

  const totalMinutes = entries.reduce((sum, e) => {
    const mins = e.durationMinutes ?? (e.endedAt ? calcDurationMinutes(e.startedAt, e.endedAt) : 0)
    return sum + mins
  }, 0)
  const billableMinutes = entries
    .filter((e) => e.isBillable)
    .reduce((sum, e) => {
      const mins = e.durationMinutes ?? (e.endedAt ? calcDurationMinutes(e.startedAt, e.endedAt) : 0)
      return sum + mins
    }, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Time Tracking</h1>
      <div className="flex gap-6 mb-6 text-sm text-muted-foreground">
        <span>{entries.length} entries</span>
        <span>Total: <strong className="text-foreground">{formatDuration(totalMinutes)}</strong></span>
        <span>Billable: <strong className="text-foreground">{formatDuration(billableMinutes)}</strong></span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-left px-4 py-2 font-medium">Client</th>
              <th className="text-left px-4 py-2 font-medium">Project</th>
              <th className="text-right px-4 py-2 font-medium">Duration</th>
              <th className="text-right px-4 py-2 font-medium">Rate</th>
              <th className="text-left px-4 py-2 font-medium">Billable</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const mins = entry.durationMinutes ?? (entry.endedAt ? calcDurationMinutes(entry.startedAt, entry.endedAt) : null)
              return (
                <tr key={entry.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{format(entry.startedAt, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-2">{entry.description ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{entry.client?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{entry.projectCode ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-mono">{mins != null ? formatDuration(mins) : "—"}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {entry.hourlyRate ? `${(entry.hourlyRate / 100).toFixed(2)} ${entry.currencyCode ?? "EUR"}/h` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      entry.isBillable ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {entry.isBillable ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {entries.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No time entries found.</p>
        )}
      </div>

      <div className="mt-8">
        <AccountantCommentBox inviteId={invite.id} entityType="time" entityId="all" token={token} />
      </div>
    </div>
  )
}
