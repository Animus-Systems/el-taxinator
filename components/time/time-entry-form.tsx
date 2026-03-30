"use client"

import { createTimeEntryAction, deleteTimeEntryAction, updateTimeEntryAction } from "@/app/(app)/time/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Client, Project, TimeEntry } from "@/prisma/client"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

type Props = {
  entry?: TimeEntry & { project: Project | null; client: Client | null }
  projects: Project[]
  clients: Client[]
  defaultStartedAt?: Date
  defaultEndedAt?: Date
  onSaved?: () => void
}

export function TimeEntryForm({ entry, projects, clients, defaultStartedAt, defaultEndedAt, onSaved }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isBillable, setIsBillable] = useState(entry?.isBillable ?? true)
  const [manualDuration, setManualDuration] = useState(!entry?.endedAt)

  const now = new Date()
  const defaultStart = defaultStartedAt ?? entry?.startedAt ?? now
  const defaultEnd = defaultEndedAt ?? entry?.endedAt ?? null

  function toDatetimeLocal(d: Date | null) {
    if (!d) return ""
    return format(d, "yyyy-MM-dd'T'HH:mm")
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("isBillable", isBillable ? "true" : "false")

    startTransition(async () => {
      const action = entry ? updateTimeEntryAction : createTimeEntryAction
      const result = await action(null, formData)
      if (result.success) {
        toast.success(entry ? "Time entry updated" : "Time entry logged")
        if (onSaved) {
          onSaved()
        } else {
          router.push("/time")
        }
      } else {
        toast.error(result.error || "Failed to save time entry")
      }
    })
  }

  async function handleDelete() {
    if (!entry || !confirm("Delete this time entry?")) return
    startTransition(async () => {
      const result = await deleteTimeEntryAction(null, entry.id)
      if (result.success) {
        toast.success("Time entry deleted")
        router.push("/time")
      } else {
        toast.error(result.error || "Failed to delete")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {entry && <input type="hidden" name="id" value={entry.id} />}

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          placeholder="What did you work on?"
          defaultValue={entry?.description ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="projectCode">Project</Label>
          <Select name="projectCode" defaultValue={entry?.projectCode ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="clientId">Client</Label>
          <Select name="clientId" defaultValue={entry?.clientId ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="manualDuration"
            checked={manualDuration}
            onCheckedChange={(v) => setManualDuration(!!v)}
          />
          <Label htmlFor="manualDuration" className="cursor-pointer">
            Enter duration manually (instead of start/end times)
          </Label>
        </div>
      </div>

      {manualDuration ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="startedAt">Date *</Label>
            <Input
              id="startedAt"
              name="startedAt"
              type="date"
              defaultValue={format(defaultStart, "yyyy-MM-dd")}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durationMinutes">Duration (minutes) *</Label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min="1"
              placeholder="e.g. 90"
              defaultValue={entry?.durationMinutes ?? ""}
              required
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="startedAt">Start Time *</Label>
            <Input
              id="startedAt"
              name="startedAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(defaultStart)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endedAt">End Time</Label>
            <Input
              id="endedAt"
              name="endedAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(defaultEnd)}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="hourlyRate">Hourly Rate</Label>
          <Input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 75.00"
            defaultValue={entry?.hourlyRate != null ? (entry.hourlyRate / 100).toFixed(2) : ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="currencyCode">Currency</Label>
          <Input
            id="currencyCode"
            name="currencyCode"
            placeholder="EUR"
            defaultValue={entry?.currencyCode ?? "EUR"}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="isBillable"
          checked={isBillable}
          onCheckedChange={(v) => setIsBillable(!!v)}
        />
        <Label htmlFor="isBillable" className="cursor-pointer">
          Billable
        </Label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Additional notes..."
          rows={3}
          defaultValue={entry?.notes ?? ""}
        />
      </div>

      <div className="flex gap-2 justify-between">
        <Button type="submit" disabled={isPending}>
          {entry ? "Save Changes" : "Log Time"}
        </Button>
        {entry && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
