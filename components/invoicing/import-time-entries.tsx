"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { calcBillableAmount } from "@/lib/time-entry-calculations"
import { Client, Project, TimeEntry } from "@/prisma/client"
import { format } from "date-fns"
import { Clock } from "lucide-react"
import { useState } from "react"
import { LineItem } from "./line-items-editor"

type TimeEntryWithRelations = TimeEntry & { project: Project | null; client: Client | null }

type Props = {
  timeEntries: TimeEntryWithRelations[]
  onImport: (items: LineItem[]) => void
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function ImportTimeEntries({ timeEntries, onImport }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const billableUnbilled = timeEntries.filter((e) => e.isBillable && !e.isInvoiced)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleImport() {
    const entries = billableUnbilled.filter((e) => selected.has(e.id))
    const items: LineItem[] = entries.map((entry, i) => {
      const hours = (entry.durationMinutes ?? 0) / 60
      const unitPrice = entry.hourlyRate ?? 0
      const description = [
        entry.description || "Time entry",
        entry.project ? `(${entry.project.name})` : "",
        format(entry.startedAt, "yyyy-MM-dd"),
      ]
        .filter(Boolean)
        .join(" — ")

      return {
        productId: null,
        description,
        quantity: parseFloat(hours.toFixed(2)),
        unitPrice,
        vatRate: 21,
        position: i,
      }
    })
    onImport(items)
    setOpen(false)
    setSelected(new Set())
  }

  if (billableUnbilled.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Clock className="h-4 w-4 mr-1" />
          Import Time Entries
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Billable Time Entries</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
          {billableUnbilled.map((entry) => {
            const amount =
              entry.durationMinutes && entry.hourlyRate
                ? calcBillableAmount(entry.durationMinutes, entry.hourlyRate)
                : null

            return (
              <div key={entry.id} className="flex items-start gap-3 border rounded p-3">
                <Checkbox
                  id={`te-${entry.id}`}
                  checked={selected.has(entry.id)}
                  onCheckedChange={() => toggle(entry.id)}
                />
                <Label htmlFor={`te-${entry.id}`} className="cursor-pointer flex-1 space-y-0.5">
                  <div className="font-medium">{entry.description || "Time entry"}</div>
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span>{format(entry.startedAt, "yyyy-MM-dd")}</span>
                    <span>{formatDuration(entry.durationMinutes)}</span>
                    {entry.project && <span>{entry.project.name}</span>}
                    {amount && (
                      <span>
                        {(amount / 100).toFixed(2)} {entry.currencyCode || "EUR"}
                      </span>
                    )}
                  </div>
                </Label>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <Button onClick={handleImport} disabled={selected.size === 0}>
            Add to Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
