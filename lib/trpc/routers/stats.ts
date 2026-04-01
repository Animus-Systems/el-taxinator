import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getDashboardStats,
  getProjectStats,
  getTimeSeriesStats,
} from "@/models/stats"
import type { TransactionFilters } from "@/models/transactions"

const statsFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  categoryCode: z.string().optional(),
  projectCode: z.string().optional(),
  type: z.string().optional(),
})

const dashboardStatsSchema = z.object({
  totalIncomePerCurrency: z.record(z.string(), z.number()),
  totalExpensesPerCurrency: z.record(z.string(), z.number()),
  profitPerCurrency: z.record(z.string(), z.number()),
  invoicesProcessed: z.number(),
})

const projectStatsSchema = z.object({
  totalIncomePerCurrency: z.record(z.string(), z.number()),
  totalExpensesPerCurrency: z.record(z.string(), z.number()),
  profitPerCurrency: z.record(z.string(), z.number()),
  invoicesProcessed: z.number(),
})

const timeSeriesDataSchema = z.object({
  period: z.string(),
  income: z.number(),
  expenses: z.number(),
  date: z.date(),
})

export const statsRouter = router({
  dashboard: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/stats/dashboard" } })
    .input(statsFiltersSchema)
    .output(dashboardStatsSchema)
    .query(async ({ ctx, input }) => {
      return getDashboardStats(ctx.user.id, input as TransactionFilters)
    }),

  projects: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/stats/projects" } })
    .input(
      statsFiltersSchema.merge(
        z.object({ projectId: z.string() }),
      ),
    )
    .output(projectStatsSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, ...filters } = input
      return getProjectStats(ctx.user.id, projectId, filters as TransactionFilters)
    }),

  timeSeries: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/stats/time-series" } })
    .input(
      statsFiltersSchema.merge(
        z.object({ currency: z.string().default("EUR") }),
      ),
    )
    .output(z.array(timeSeriesDataSchema))
    .query(async ({ ctx, input }) => {
      const { currency, ...filters } = input
      return getTimeSeriesStats(ctx.user.id, filters as TransactionFilters, currency)
    }),
})
