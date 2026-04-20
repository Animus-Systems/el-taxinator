/**
 * Date-range filter with preset dropdown + custom range.
 *
 * Matches the dense preset list seen on accounting-app filters:
 *   Last 12 months · Today · Yesterday · Last 7 days · Current month …
 *   Years › / Quarters › / Months › submenus
 *   Custom range … opens two date inputs inline
 *
 * Emits `{ from, to }` as ISO yyyy-MM-dd strings (or empty strings for
 * "no bound") so the caller can plug the values straight into date <input>
 * fields or Date filters without timezone surprises.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  addDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns"
import {
  Calendar as CalendarIcon,
  ChevronDown,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type DateRange = { from: string; to: string }

type Props = {
  value: DateRange
  onChange: (next: DateRange) => void
  /** Number of past years to list under "Years ›". Defaults to 6. */
  yearsBack?: number
  /** Number of past quarters to list. Defaults to 8. */
  quartersBack?: number
  /** Number of past months to list. Defaults to 12. */
  monthsBack?: number
  className?: string
}

function iso(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

function rangeFor(from: Date, to: Date): DateRange {
  return { from: iso(from), to: iso(to) }
}

/**
 * Convenience helper for callers that want "current year" as their default
 * filter state on mount. Matches the "Current year" preset in this component.
 */
export function currentYearRange(now: Date = new Date()): DateRange {
  return rangeFor(startOfYear(now), endOfYear(now))
}

function displayLabel(v: DateRange): string {
  if (!v.from && !v.to) return ""
  const fmt = (s: string): string => {
    if (!s) return "…"
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? s : format(d, "dd/MM/yyyy")
  }
  return `${fmt(v.from)} – ${fmt(v.to)}`
}

export function DateRangePresetFilter({
  value,
  onChange,
  yearsBack = 6,
  quartersBack = 8,
  monthsBack = 12,
  className,
}: Props) {
  const { t } = useTranslation("common")
  const [open, setOpen] = useState(false)

  const now = useMemo(() => new Date(), [])

  function pick(r: DateRange): void {
    onChange(r)
    setOpen(false)
  }

  const years = useMemo(() => {
    const out: { year: number; range: DateRange }[] = []
    for (let i = 0; i < yearsBack; i++) {
      const y = now.getFullYear() - i
      const from = new Date(y, 0, 1)
      const to = new Date(y, 11, 31)
      out.push({ year: y, range: rangeFor(from, to) })
    }
    return out
  }, [now, yearsBack])

  const quarters = useMemo(() => {
    const out: { label: string; range: DateRange }[] = []
    for (let i = 0; i < quartersBack; i++) {
      const anchor = subQuarters(now, i)
      const from = startOfQuarter(anchor)
      const to = endOfQuarter(anchor)
      const q = Math.floor(from.getMonth() / 3) + 1
      out.push({
        label: `Q${q} ${from.getFullYear()}`,
        range: rangeFor(from, to),
      })
    }
    return out
  }, [now, quartersBack])

  const months = useMemo(() => {
    const out: { label: string; range: DateRange }[] = []
    for (let i = 0; i < monthsBack; i++) {
      const anchor = subMonths(now, i)
      const from = startOfMonth(anchor)
      const to = endOfMonth(anchor)
      out.push({
        label: format(from, "MMMM yyyy"),
        range: rangeFor(from, to),
      })
    }
    return out
  }, [now, monthsBack])

  const active = !!value.from || !!value.to
  const label = active
    ? displayLabel(value)
    : t("dateFilter.trigger", { defaultValue: "Date range" })

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-between gap-2 font-normal min-w-[220px]"
          >
            <span className="inline-flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {label}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={() => pick(rangeFor(subMonths(now, 12), now))}
          >
            {t("dateFilter.last12Months", { defaultValue: "Last 12 months" })}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => pick(rangeFor(now, now))}>
            {t("dateFilter.today", { defaultValue: "Today" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const y = subDays(now, 1)
              pick(rangeFor(y, y))
            }}
          >
            {t("dateFilter.yesterday", { defaultValue: "Yesterday" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => pick(rangeFor(subDays(now, 6), now))}
          >
            {t("dateFilter.last7Days", { defaultValue: "Last 7 days" })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => pick(rangeFor(startOfMonth(now), endOfMonth(now)))}
          >
            {t("dateFilter.currentMonth", { defaultValue: "Current month" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const prev = subMonths(now, 1)
              pick(rangeFor(startOfMonth(prev), endOfMonth(prev)))
            }}
          >
            {t("dateFilter.lastMonth", { defaultValue: "Last month" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => pick(rangeFor(startOfQuarter(now), endOfQuarter(now)))}
          >
            {t("dateFilter.currentQuarter", { defaultValue: "Current quarter" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const prev = subQuarters(now, 1)
              pick(rangeFor(startOfQuarter(prev), endOfQuarter(prev)))
            }}
          >
            {t("dateFilter.previousQuarter", { defaultValue: "Previous quarter" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => pick(rangeFor(startOfYear(now), endOfYear(now)))}
          >
            {t("dateFilter.currentYear", { defaultValue: "Current year" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const prev = subYears(now, 1)
              pick(rangeFor(startOfYear(prev), endOfYear(prev)))
            }}
          >
            {t("dateFilter.lastYear", { defaultValue: "Last year" })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("dateFilter.years", { defaultValue: "Years" })}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              {years.map((y) => (
                <DropdownMenuItem key={y.year} onClick={() => pick(y.range)}>
                  {y.year}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("dateFilter.quarters", { defaultValue: "Quarters" })}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              {quarters.map((q) => (
                <DropdownMenuItem key={q.label} onClick={() => pick(q.range)}>
                  {q.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("dateFilter.months", { defaultValue: "Months" })}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              {months.map((m) => (
                <DropdownMenuItem key={m.label} onClick={() => pick(m.range)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="pb-1 text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
            {t("dateFilter.custom", { defaultValue: "Custom range" })}
          </DropdownMenuLabel>
          <div
            className="flex flex-col gap-1 px-2 pb-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <label className="text-[10px] text-muted-foreground">
              {t("dateFilter.from", { defaultValue: "From" })}
            </label>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="h-8"
            />
            <label className="text-[10px] text-muted-foreground">
              {t("dateFilter.to", { defaultValue: "To" })}
            </label>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => {
                const today = iso(now)
                if (!value.from && !value.to) {
                  onChange({ from: iso(addDays(now, -30)), to: today })
                }
                setOpen(false)
              }}
            >
              {t("dateFilter.apply", { defaultValue: "Apply" })}
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {active && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onChange({ from: "", to: "" })}
          aria-label={t("dateFilter.clear", { defaultValue: "Clear date filter" })}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
