/**
 * Clickable column header that cycles: unsorted → asc → desc → unsorted.
 * Thin shell around <TableHead>. The parent owns the sort state so multiple
 * headers coordinate and only one column is active at a time.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc" | null

export type SortState<K extends string> = {
  key: K
  direction: Exclude<SortDirection, null>
} | null

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, direction: "asc" }
  if (current.direction === "asc") return { key, direction: "desc" }
  return null
}

export function SortableHeader<K extends string>({
  columnKey,
  sort,
  onSort,
  align = "left",
  children,
  className,
}: {
  columnKey: K
  sort: SortState<K>
  onSort: (next: SortState<K>) => void
  align?: "left" | "right"
  children: React.ReactNode
  className?: string
}) {
  const active = sort?.key === columnKey
  const direction = active ? sort?.direction : null
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown

  return (
    <TableHead className={cn(align === "right" ? "text-right" : "", className)}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, columnKey))}
        className={cn(
          "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:bg-muted/50 transition-colors select-none",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" ? "flex-row-reverse" : "",
        )}
        aria-label={active ? `Sorted ${direction}` : "Sort column"}
      >
        <span>{children}</span>
        <Icon className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  )
}
