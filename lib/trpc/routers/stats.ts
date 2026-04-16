import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getDashboardAnalytics,
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

const analyticsCategoryBreakdownSchema = z.object({
  code: z.string(),
  name: z.string(),
  color: z.string(),
  expenses: z.number(),
  transactionCount: z.number(),
})

const analyticsTopMerchantSchema = z.object({
  merchant: z.string(),
  expenses: z.number(),
  transactionCount: z.number(),
})

const analyticsProfitTrendSchema = z.object({
  period: z.string(),
  profit: z.number(),
  date: z.date(),
})

const dashboardAnalyticsSchema = z.object({
  timeSeries: z.array(timeSeriesDataSchema),
  categoryBreakdown: z.array(analyticsCategoryBreakdownSchema),
  topMerchants: z.array(analyticsTopMerchantSchema),
  profitTrend: z.array(analyticsProfitTrendSchema),
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

  analytics: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/stats/analytics" } })
    .input(
      statsFiltersSchema.merge(
        z.object({ currency: z.string().default("EUR") }),
      ),
    )
    .output(dashboardAnalyticsSchema)
    .query(async ({ ctx, input }) => {
      const { currency, ...filters } = input
      return getDashboardAnalytics(ctx.user.id, filters as TransactionFilters, currency)
    }),
})
