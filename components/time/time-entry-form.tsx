
import { createTimeEntryAction, deleteTimeEntryAction, updateTimeEntryAction } from "@/actions/time"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Client, Project, TimeEntry } from "@/lib/db-types"
import { format } from "date-fns"
import { useRouter } from "@/lib/navigation"
import { useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"
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
  const t = useTranslations("time")
  const locale = useLocale()
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
        toast.success(entry ? t("timeEntryUpdated") : t("timeEntryLogged"))
        if (onSaved) {
          onSaved()
        } else {
          router.push("/time")
        }
      } else {
        toast.error(result.error || t("failedToSaveTimeEntry"))
      }
    })
  }

  async function handleDelete() {
    if (!entry || !confirm(t("deleteTimeEntry"))) return
    startTransition(async () => {
      const result = await deleteTimeEntryAction(null, entry.id)
      if (result.success) {
        toast.success(t("timeEntryDeleted"))
        router.push("/time")
      } else {
        toast.error(result.error || t("failedToDelete"))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {entry && <input type="hidden" name="id" value={entry.id} />}

      <div className="space-y-1">
        <Label htmlFor="description">{t("description")}</Label>
        <Input
          id="description"
          name="description"
          placeholder={t("whatDidYouWorkOn")}
          defaultValue={entry?.description ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="projectCode">{t("projectLabel")}</Label>
          <Select name="projectCode" defaultValue={entry?.projectCode ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectProject")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("none")}</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {getLocalizedValue(p.name, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="clientId">{t("clientLabel")}</Label>
          <Select name="clientId" defaultValue={entry?.clientId ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectClient")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("none")}</SelectItem>
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
            {t("enterDurationManually")}
          </Label>
        </div>
      </div>

      {manualDuration ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="startedAt">{t("dateLabel")}</Label>
            <Input
              id="startedAt"
              name="startedAt"
              type="date"
              defaultValue={format(defaultStart, "yyyy-MM-dd")}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durationMinutes">{t("durationMinutes")}</Label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min="1"
              placeholder={t("durationPlaceholder")}
              defaultValue={entry?.durationMinutes ?? ""}
              required
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="startedAt">{t("startTime")}</Label>
            <Input
              id="startedAt"
              name="startedAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(defaultStart)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endedAt">{t("endTime")}</Label>
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
          <Label htmlFor="hourlyRate">{t("hourlyRate")}</Label>
          <Input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            placeholder={t("ratePlaceholder")}
            defaultValue={entry?.hourlyRate != null ? (entry.hourlyRate / 100).toFixed(2) : ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="currencyCode">{t("currency")}</Label>
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
          {t("billable")}
        </Label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder={t("notesPlaceholder")}
          rows={3}
          defaultValue={entry?.notes ?? ""}
        />
      </div>

      <div className="flex gap-2 justify-between">
        <Button type="submit" disabled={isPending}>
          {entry ? t("saveChanges") : t("logTime")}
        </Button>
        {entry && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {t("delete")}
          </Button>
        )}
      </div>
    </form>
  )
}
