import type React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

export type CasillaRow = {
  casilla: string
  label: string
  amountCents: number
  highlight?: "positive" | "negative" | "neutral"
  drillDownKey?: string
}

export type CasillaGroup = { heading?: string; rows: CasillaRow[] }

export type CasillaTableProps = {
  groups: CasillaGroup[]
  resultRow?: CasillaRow
  onDrillDown?: (key: string) => void
  footer?: React.ReactNode
}

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function amountColorClass(highlight: CasillaRow["highlight"]): string {
  if (highlight === "positive") return "text-red-600 dark:text-red-400 font-semibold"
  if (highlight === "negative") return "text-green-600 dark:text-green-400 font-semibold"
  return "text-foreground"
}

function CasillaPill({ value }: { value: string }) {
  if (!value) return <span aria-hidden />
  return (
    <span className="inline-flex justify-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {value}
    </span>
  )
}

function RowBody({ row, clickable }: { row: CasillaRow; clickable: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_1fr_auto_1.25rem] items-center gap-3 py-2 text-sm",
        clickable && "hover:bg-muted/50 rounded px-2 -mx-2",
      )}
    >
      <CasillaPill value={row.casilla} />
      <span className="text-muted-foreground text-left">{row.label}</span>
      <span className={cn("tabular-nums text-right", amountColorClass(row.highlight))}>
        {formatEUR(row.amountCents)}
      </span>
      {clickable ? (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) : (
        <span aria-hidden />
      )}
    </div>
  )
}

function Row({
  row,
  onDrillDown,
}: {
  row: CasillaRow
  onDrillDown?: (key: string) => void
}) {
  const drillKey = row.drillDownKey
  if (drillKey && onDrillDown) {
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onDrillDown(drillKey)}
      >
        <RowBody row={row} clickable />
      </button>
    )
  }
  return <RowBody row={row} clickable={false} />
}

function ResultRowBody({ row }: { row: CasillaRow }) {
  const bgClass =
    row.highlight === "positive"
      ? "bg-red-50 dark:bg-red-950/30"
      : row.highlight === "negative"
        ? "bg-green-50 dark:bg-green-950/30"
        : "bg-muted/40"
  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_1fr_auto_1.25rem] items-center gap-3 rounded px-3 py-3 text-base",
        bgClass,
      )}
    >
      <CasillaPill value={row.casilla} />
      <span className="font-medium">{row.label}</span>
      <span className={cn("tabular-nums text-right", amountColorClass(row.highlight))}>
        {formatEUR(row.amountCents)}
      </span>
      <span aria-hidden />
    </div>
  )
}

export function CasillaTable({ groups, resultRow, onDrillDown, footer }: CasillaTableProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {groups.map((group, groupIdx) => (
            <div key={group.heading ?? `group-${groupIdx}`}>
              {group.heading ? (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.heading}
                </p>
              ) : null}
              <div className="divide-y">
                {group.rows.map((row, rowIdx) => (
                  <Row
                    key={`${row.casilla}-${row.label}-${rowIdx}`}
                    row={row}
                    {...(onDrillDown && { onDrillDown })}
                  />
                ))}
              </div>
            </div>
          ))}
          {resultRow ? (
            <>
              <Separator />
              <ResultRowBody row={resultRow} />
            </>
          ) : null}
          {footer ? (
            <div className="pt-2 text-xs text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
