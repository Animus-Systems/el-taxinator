import { z } from "zod"

const nullableString = z.preprocess((value) => {
  if (value === "" || value === undefined) {
    return null
  }
  return value
}, z.string().nullable())

const nullableDate = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed
  }
  return value
}, z.date().nullable())

const nullableInt = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) {
    return null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : value
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().int().nullable())

export const timeEntryFormSchema = z.object({
  description: nullableString,
  projectCode: nullableString,
  clientId: nullableString,
  startedAt: z.preprocess((value) => {
    if (value instanceof Date) return value
    if (typeof value === "string") return new Date(value)
    return value
  }, z.date()),
  endedAt: nullableDate,
  durationMinutes: nullableInt,
  hourlyRate: z.preprocess((value) => {
    if (value === "" || value === undefined || value === null) {
      return null
    }
    if (typeof value === "number") {
      return Math.round(value * 100)
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value)
      return Number.isNaN(parsed) ? value : Math.round(parsed * 100)
    }
    return value
  }, z.number().int().nullable()),
  currencyCode: nullableString,
  isBillable: z.preprocess((value) => {
    if (typeof value === "boolean") return value
    if (typeof value === "string") return value === "true" || value === "on"
    return true
  }, z.boolean()),
  notes: nullableString,
})

export type TimeEntryFormData = z.infer<typeof timeEntryFormSchema>
