import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

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

export function calcDurationMinutes(startedAt: Date, endedAt: Date): number {
  return Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
}

export function calcBillableAmount(durationMinutes: number, hourlyRate: number): number {
  return Math.round((durationMinutes / 60) * hourlyRate)
}

export const getTimeEntries = cache(async (userId: string, filters?: TimeEntryFilters) => {
  const where: Prisma.TimeEntryWhereInput = { userId }

  if (filters) {
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: "insensitive" } },
        { notes: { contains: filters.search, mode: "insensitive" } },
      ]
    }

    if (filters.dateFrom || filters.dateTo) {
      where.startedAt = {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    }

    if (filters.projectCode) {
      where.projectCode = filters.projectCode
    }

    if (filters.clientId) {
      where.clientId = filters.clientId
    }

    if (filters.isBillable !== undefined) {
      where.isBillable = filters.isBillable
    }

    if (filters.isInvoiced !== undefined) {
      where.isInvoiced = filters.isInvoiced
    }
  }

  return prisma.timeEntry.findMany({
    where,
    include: { project: true, client: true },
    orderBy: { startedAt: "desc" },
  })
})

export const getTimeEntryById = cache(async (id: string, userId: string) => {
  return prisma.timeEntry.findFirst({
    where: { id, userId },
    include: { project: true, client: true },
  })
})

export async function createTimeEntry(userId: string, data: TimeEntryData) {
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  let durationMinutes = data.durationMinutes ?? null
  if (durationMinutes === null && endedAt) {
    durationMinutes = calcDurationMinutes(startedAt, endedAt)
  }

  return prisma.timeEntry.create({
    data: {
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
    },
    include: { project: true, client: true },
  })
}

export async function updateTimeEntry(id: string, userId: string, data: TimeEntryData) {
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  let durationMinutes = data.durationMinutes ?? null
  if (durationMinutes === null && endedAt) {
    durationMinutes = calcDurationMinutes(startedAt, endedAt)
  }

  return prisma.timeEntry.update({
    where: { id, userId },
    data: {
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
    },
    include: { project: true, client: true },
  })
}

export async function deleteTimeEntry(id: string, userId: string) {
  return prisma.timeEntry.delete({ where: { id, userId } })
}

export async function markTimeEntriesInvoiced(ids: string[], userId: string) {
  return prisma.timeEntry.updateMany({
    where: { id: { in: ids }, userId },
    data: { isInvoiced: true },
  })
}

export type TimeEntrySummary = {
  totalMinutes: number
  billableMinutes: number
  totalAmount: number
  entryCount: number
}

export async function getTimeEntrySummary(
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<TimeEntrySummary> {
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { gte: dateFrom, lte: dateTo },
    },
  })

  let totalMinutes = 0
  let billableMinutes = 0
  let totalAmount = 0

  for (const entry of entries) {
    const mins = entry.durationMinutes ?? 0
    totalMinutes += mins
    if (entry.isBillable) {
      billableMinutes += mins
      if (entry.hourlyRate) {
        totalAmount += calcBillableAmount(mins, entry.hourlyRate)
      }
    }
  }

  return { totalMinutes, billableMinutes, totalAmount, entryCount: entries.length }
}
