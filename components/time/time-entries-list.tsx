"use client"

import { deleteTimeEntryAction } from "@/app/(app)/time/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcBillableAmount } from "@/lib/time-entry-calculations"
import { formatCurrency } from "@/lib/utils"
import { Client, Project, TimeEntry } from "@/prisma/client"
import { format } from "date-fns"
import { Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

type TimeEntryWithRelations = TimeEntry & { project: Project | null; client: Client | null }

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function EntryRow({ entry }: { entry: TimeEntryWithRelations }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm("Delete this time entry?")) return
    startTransition(async () => {
      const result = await deleteTimeEntryAction(null, entry.id)
      if (!result.success) toast.error(result.error || "Failed to delete")
    })
  }

  const billableAmount =
    entry.isBillable && entry.durationMinutes && entry.hourlyRate
      ? calcBillableAmount(entry.durationMinutes, entry.hourlyRate)
      : null

  return (
    <TableRow>
      <TableCell className="font-medium">{entry.description || "—"}</TableCell>
      <TableCell>{format(entry.startedAt, "yyyy-MM-dd")}</TableCell>
      <TableCell>{formatDuration(entry.durationMinutes)}</TableCell>
      <TableCell>{entry.project?.name || "—"}</TableCell>
      <TableCell>{entry.client?.name || "—"}</TableCell>
      <TableCell>
        {entry.isBillable ? (
          <Badge variant={entry.isInvoiced ? "outline" : "default"}>
            {entry.isInvoiced ? "Invoiced" : "Billable"}
          </Badge>
        ) : (
          <Badge variant="secondary">Non-billable</Badge>
        )}
      </TableCell>
      <TableCell>
        {billableAmount
          ? formatCurrency(billableAmount, entry.currencyCode || "EUR")
          : entry.hourlyRate
            ? formatCurrency(entry.hourlyRate, entry.currencyCode || "EUR") + "/h"
            : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" asChild>
            <Link href={`/time/${entry.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function TimeEntriesList({ entries }: { entries: TimeEntryWithRelations[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>No time entries yet.</p>
        <Button asChild>
          <Link href="/time/new">Log your first entry</Link>
        </Button>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </TableBody>
    </Table>
  )
}
