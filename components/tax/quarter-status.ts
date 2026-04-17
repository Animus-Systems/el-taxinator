import type { TaxFiling } from "@/lib/db-types"

export type QuarterStatus = "filed" | "overdue" | "current" | "upcoming" | "future"

export type QuarterStatusInput = {
  year: number
  quarter: number
  deadline: Date
  filings: TaxFiling[]
  entityType: "autonomo" | "sl" | "individual"
  now?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function codesForEntity(entityType: "autonomo" | "sl" | "individual"): string[] {
  if (entityType === "sl") return ["420", "202"]
  return ["420", "130"]
}

export function quarterStatus({ year, quarter, deadline, filings, entityType, now = new Date() }: QuarterStatusInput): QuarterStatus {
  const codes = codesForEntity(entityType)
  const relevant = filings.filter((f) => f.year === year && f.quarter === quarter && codes.includes(f.modeloCode))
  const allFiled = codes.length > 0 && codes.every((c) => relevant.some((f) => f.modeloCode === c && f.filedAt !== null))
  if (allFiled) return "filed"

  const diff = deadline.getTime() - now.getTime()
  if (diff < 0) return "overdue"
  if (diff < 30 * DAY_MS) return "current"
  if (diff < 90 * DAY_MS) return "upcoming"
  return "future"
}

export function pickNextDeadline(
  summaries: Array<{ quarter: number; deadline: Date }>,
  filings: TaxFiling[],
  year: number,
  entityType: "autonomo" | "sl" | "individual",
  now: Date = new Date(),
): { quarter: number; deadline: Date } | null {
  const unfiled = summaries
    .map((s) => ({ ...s, status: quarterStatus({ year, quarter: s.quarter, deadline: s.deadline, filings, entityType, now }) }))
    .filter((s) => s.status !== "filed")
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
  return unfiled[0] ?? null
}
