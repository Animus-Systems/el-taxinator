import { getPool } from "@/lib/pg"
import {
  sql,
  queryMany,
  queryOne,
  buildInsert,
  buildUpdate,
  execute,
  mapRow,
  mapProjectFromRow,
  mapClientFromRow,
} from "@/lib/sql"
import type { TimeEntry, Project, Client } from "@/lib/db-types"
import { calcBillableAmount, calcDurationMinutes } from "@/lib/time-entry-calculations"
import { cache } from "react"

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type TimeEntryData = {
  description?: string | null
  projectCode?: string | null
  clientId?: string | null
  startedAt: Date | string
  endedAt?: Date | string | null
  durationMinutes?: number | null
  hourlyRate?: number | null
  currencyCode?: string | null
  isBillable?: boolean
  notes?: string | null
}

export type TimeEntryFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  projectCode?: string
  clientId?: string
  isBillable?: boolean
  isInvoiced?: boolean
}

export type TimeEntryWithRelations = TimeEntry & {
  project: Project | null
  client: Client | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELECT_WITH_JOINS = `
  SELECT te.*,
    p.id        AS proj_id,
    p.user_id   AS proj_user_id,
    p.code      AS proj_code,
    p.name      AS proj_name,
    p.color     AS proj_color,
    p.llm_prompt AS proj_llm_prompt,
    p.created_at AS proj_created_at,
    cl.id        AS cl_id,
    cl.user_id   AS cl_user_id,
    cl.name      AS cl_name,
    cl.email     AS cl_email,
    cl.phone     AS cl_phone,
    cl.address   AS cl_address,
    cl.tax_id    AS cl_tax_id,
    cl.notes     AS cl_notes,
    cl.created_at AS cl_created_at,
    cl.updated_at AS cl_updated_at
  FROM time_entries te
  LEFT JOIN projects p  ON p.code = te.project_code AND p.user_id = te.user_id
  LEFT JOIN clients  cl ON cl.id  = te.client_id
`

function mapTimeEntryRow(row: Record<string, unknown>): TimeEntryWithRelations {
  const entry = mapRow<TimeEntryWithRelations>(row)
  entry.project = mapProjectFromRow(row)
  entry.client = mapClientFromRow(row)
  return entry
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getTimeEntries = cache(
  async (userId: string, filters?: TimeEntryFilters): Promise<TimeEntryWithRelations[]> => {
    const pool = await getPool()
    const conditions: string[] = ["te.user_id = $1"]
    const values: unknown[] = [userId]
    let idx = 2

    if (filters) {
      if (filters.search) {
        const like = `%${filters.search}%`
        conditions.push(`(te.description ILIKE $${idx} OR te.notes ILIKE $${idx})`)
        values.push(like)
        idx++
      }

      if (filters.dateFrom) {
        conditions.push(`te.started_at >= $${idx}`)
        values.push(new Date(filters.dateFrom))
        idx++
      }

      if (filters.dateTo) {
        conditions.push(`te.started_at <= $${idx}`)
        values.push(new Date(filters.dateTo))
        idx++
      }

      if (filters.projectCode) {
        conditions.push(`te.project_code = $${idx}`)
        values.push(filters.projectCode)
        idx++
      }

      if (filters.clientId) {
        conditions.push(`te.client_id = $${idx}`)
        values.push(filters.clientId)
        idx++
      }

      if (filters.isBillable !== undefined) {
        conditions.push(`te.is_billable = $${idx}`)
        values.push(filters.isBillable)
        idx++
      }

      if (filters.isInvoiced !== undefined) {
        conditions.push(`te.is_invoiced = $${idx}`)
        values.push(filters.isInvoiced)
        idx++
      }
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : ""
    const queryText = `${SELECT_WITH_JOINS} ${where} ORDER BY te.started_at DESC LIMIT 1000`
    const result = await pool.query(queryText, values)
    return result.rows.map(mapTimeEntryRow)
  },
)

export const getTimeEntryById = cache(
  async (id: string, userId: string): Promise<TimeEntryWithRelations | null> => {
    const pool = await getPool()
    const result = await pool.query(
      `${SELECT_WITH_JOINS} WHERE te.id = $1 AND te.user_id = $2`,
      [id, userId],
    )
    if (result.rows.length === 0) return null
    return mapTimeEntryRow(result.rows[0])
  },
)

export async function createTimeEntry(
  userId: string,
  data: TimeEntryData,
): Promise<TimeEntryWithRelations> {
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  let durationMinutes = data.durationMinutes ?? null
  if (durationMinutes === null && endedAt) {
    durationMinutes = calcDurationMinutes(startedAt, endedAt)
  }

  const insertData = {
    userId,
    description: data.description ?? null,
    projectCode: data.projectCode ?? null,
    clientId: data.clientId ?? null,
    startedAt,
    endedAt,
    durationMinutes,
    hourlyRate: data.hourlyRate ?? null,
    currencyCode: data.currencyCode ?? null,
    isBillable: data.isBillable ?? true,
    notes: data.notes ?? null,
  }

  const entry = await queryOne<TimeEntry>(buildInsert("time_entries", insertData))

  // Re-fetch with joins to include project and client
  return (await getTimeEntryById(entry!.id, userId))!
}

export async function updateTimeEntry(
  id: string,
  userId: string,
  data: TimeEntryData,
): Promise<TimeEntryWithRelations> {
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  let durationMinutes = data.durationMinutes ?? null
  if (durationMinutes === null && endedAt) {
    durationMinutes = calcDurationMinutes(startedAt, endedAt)
  }

  const updateData = {
    description: data.description ?? null,
    projectCode: data.projectCode ?? null,
    clientId: data.clientId ?? null,
    startedAt,
    endedAt,
    durationMinutes,
    hourlyRate: data.hourlyRate ?? null,
    currencyCode: data.currencyCode ?? null,
    isBillable: data.isBillable ?? true,
    notes: data.notes ?? null,
  }

  await queryOne<TimeEntry>(
    buildUpdate("time_entries", updateData, "id = $1 AND user_id = $2", [id, userId]),
  )

  // Re-fetch with joins
  return (await getTimeEntryById(id, userId))!
}

export async function deleteTimeEntry(id: string, userId: string) {
  const result = await queryOne<TimeEntry>(
    sql`DELETE FROM time_entries WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
  return result
}

export async function markTimeEntriesInvoiced(ids: string[], userId: string) {
  const pool = await getPool()
  if (ids.length === 0) return { count: 0 }
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ")
  const result = await pool.query(
    `UPDATE time_entries SET is_invoiced = true WHERE id IN (${placeholders}) AND user_id = $1`,
    [userId, ...ids],
  )
  return { count: result.rowCount ?? 0 }
}

// ---------------------------------------------------------------------------
// Summary (using SQL aggregation)
// ---------------------------------------------------------------------------

export type TimeEntrySummary = {
  totalMinutes: number
  billableMinutes: number
  totalAmount: number
  entryCount: number
}

export async function getTimeEntrySummary(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<TimeEntrySummary> {
  const pool = await getPool()
  // Use SQL aggregation instead of loading all rows
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(duration_minutes), 0)::int AS total_minutes,
       COALESCE(SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END), 0)::int AS billable_minutes,
       COUNT(*)::int AS entry_count
     FROM time_entries
     WHERE user_id = $1 AND started_at >= $2 AND started_at <= $3`,
    [userId, dateFrom, dateTo],
  )

  const { total_minutes, billable_minutes, entry_count } = result.rows[0]

  // For totalAmount we still need per-row calculation since it depends on hourly_rate
  // which varies per entry. We can compute it in SQL too:
  const amountResult = await pool.query(
    `SELECT COALESCE(SUM(
       CASE WHEN is_billable AND hourly_rate IS NOT NULL
            THEN ROUND((COALESCE(duration_minutes, 0)::numeric / 60.0) * hourly_rate)
            ELSE 0 END
     ), 0)::int AS total_amount
     FROM time_entries
     WHERE user_id = $1 AND started_at >= $2 AND started_at <= $3`,
    [userId, dateFrom, dateTo],
  )

  return {
    totalMinutes: total_minutes,
    billableMinutes: billable_minutes,
    totalAmount: amountResult.rows[0].total_amount,
    entryCount: entry_count,
  }
}
