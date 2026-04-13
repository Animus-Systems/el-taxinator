
import { deleteTimeEntryAction } from "@/actions/time"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcBillableAmount } from "@/lib/time-entry-calculations"
import { formatCurrency } from "@/lib/utils"
import type { TimeEntryWithRelations } from "@/models/time-entries"
import { format } from "date-fns"
import { Pencil, Trash2 } from "lucide-react"
import { Link } from "@/lib/navigation"
import { useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"
import { toast } from "sonner"

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function EntryRow({ entry }: { entry: TimeEntryWithRelations }) {
  const t = useTranslations("time")
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(t("deleteTimeEntry"))) return
    startTransition(async () => {
      const result = await deleteTimeEntryAction(null, entry.id)
      if (!result.success) toast.error(result.error || t("failedToDelete"))
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
      <TableCell>{getLocalizedValue(entry.project?.name, locale) || "—"}</TableCell>
      <TableCell>{entry.client?.name || "—"}</TableCell>
      <TableCell>
        {entry.isBillable ? (
          <Badge variant={entry.isInvoiced ? "outline" : "default"}>
            {entry.isInvoiced ? t("invoiced") : t("billable")}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("nonBillable")}</Badge>
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
  const t = useTranslations("time")
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <p>{t("noTimeEntries")}</p>
        <Button asChild>
          <Link href="/time/new">{t("logFirstEntry")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("description")}</TableHead>
          <TableHead>{t("date")}</TableHead>
          <TableHead>{t("duration")}</TableHead>
          <TableHead>{t("project")}</TableHead>
          <TableHead>{t("client")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead>{t("amount")}</TableHead>
          <TableHead className="text-right">{t("actions")}</TableHead>
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
