import { formatCurrency } from "@/lib/utils"
import type { TimeEntrySummary } from "@/models/time-entries"

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-4 bg-card space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function TimeSummary({ summary }: { summary: TimeEntrySummary }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">This month</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total entries" value={String(summary.entryCount)} />
        <StatCard label="Total time" value={formatDuration(summary.totalMinutes)} />
        <StatCard label="Billable time" value={formatDuration(summary.billableMinutes)} />
        <StatCard
          label="Billable amount"
          value={summary.totalAmount > 0 ? formatCurrency(summary.totalAmount, "EUR") : "—"}
        />
      </div>
    </div>
  )
}
