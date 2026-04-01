import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getTimeEntries,
  getTimeEntryById,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  markTimeEntriesInvoiced,
  getTimeEntrySummary,
} from "@/models/time-entries"
import type { TimeEntryData, TimeEntryFilters } from "@/models/time-entries"
import {
  timeEntrySchema,
  projectSchema,
  clientSchema,
} from "@/lib/db-types"

// Time entry with joined project/client relations
const timeEntryWithRelationsSchema = timeEntrySchema.extend({
  project: projectSchema.nullable(),
  client: clientSchema.nullable(),
}).passthrough()

const timeEntrySummarySchema = z.object({
  totalMinutes: z.number(),
  billableMinutes: z.number(),
  totalAmount: z.number(),
  entryCount: z.number(),
})

const timeEntryFiltersSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  projectCode: z.string().optional(),
  clientId: z.string().optional(),
  isBillable: z.boolean().optional(),
  isInvoiced: z.boolean().optional(),
})

const timeEntryInputSchema = z.object({
  description: z.string().nullish(),
  projectCode: z.string().nullish(),
  clientId: z.string().nullish(),
  startedAt: z.union([z.date(), z.string()]),
  endedAt: z.union([z.date(), z.string()]).nullish(),
  durationMinutes: z.number().int().nullish(),
  hourlyRate: z.number().nullish(),
  currencyCode: z.string().nullish(),
  isBillable: z.boolean().optional(),
  notes: z.string().nullish(),
})

export const timeEntriesRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/time-entries" } })
    .input(timeEntryFiltersSchema)
    .output(z.array(timeEntryWithRelationsSchema))
    .query(async ({ ctx, input }) => {
      const filters: TimeEntryFilters = {
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        projectCode: input.projectCode,
        clientId: input.clientId,
        isBillable: input.isBillable,
        isInvoiced: input.isInvoiced,
      }
      return getTimeEntries(ctx.user.id, filters)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/time-entries/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(timeEntryWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getTimeEntryById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/time-entries" } })
    .input(timeEntryInputSchema)
    .output(timeEntryWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      return createTimeEntry(ctx.user.id, input as TimeEntryData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/time-entries/{id}" } })
    .input(z.object({ id: z.string() }).merge(timeEntryInputSchema))
    .output(timeEntryWithRelationsSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateTimeEntry(id, ctx.user.id, data as TimeEntryData)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/time-entries/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(timeEntrySchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteTimeEntry(input.id, ctx.user.id)
    }),

  markInvoiced: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/time-entries/mark-invoiced" } })
    .input(z.object({ ids: z.array(z.string()) }))
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return markTimeEntriesInvoiced(input.ids, ctx.user.id)
    }),

  summary: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/time-entries/summary" } })
    .input(
      z.object({
        dateFrom: z.string(),
        dateTo: z.string(),
      }),
    )
    .output(timeEntrySummarySchema)
    .query(async ({ ctx, input }) => {
      return getTimeEntrySummary(
        ctx.user.id,
        new Date(input.dateFrom),
        new Date(input.dateTo),
      )
    }),
})
